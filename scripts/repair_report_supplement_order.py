"""Repair only source order metadata from saved supplement candidates (dry run by default)."""
import argparse
import json
import shlex
import sys
import uuid

from ssh_config import connect

JS = r"""
require('dotenv').config({path:'backend/.env',quiet:true});
const mongoose=require('mongoose');
const crypto=require('crypto');
(async()=>{
 const input=JSON.parse(process.argv[1]);
 const commit=require('child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(input.apply && commit!==input.expectedCommit)throw new Error('server_commit_changed');
 await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});
 const db=mongoose.connection.db, id=new mongoose.Types.ObjectId(input.reportId);
 const report=await db.collection('medicalreports').findOne({_id:id},
  {projection:{audit_status:1,reviewRevision:1,reportItems:1,pageParseHistory:1,pageParseStatus:1}});
 if(!report||report.audit_status!=='unaudited'||Number(report.reviewRevision)!==input.revision
    ||report.pageParseStatus?.status==='processing')throw new Error('report_state_changed');
 const norm=s=>String(s||'').trim().replace(/^[\s【\[『「]+|[\s】\]』」]+$/g,'').replace(/\s+/g,'');
 const section=x=>norm(x.sourceSection||x.orderName)||'未识别原件栏目';
 const plan=[];
 for(const page of input.pages){
  const history=[...(report.pageParseHistory||[])].reverse().find(h=>Number(h.pageNum)===page);
  if(!history||!Array.isArray(history.aiCandidates)||!history.aiCandidates.length)throw new Error('missing_candidate_history_page_'+page);
  const candidates=history.aiCandidates;
  const positions=(report.reportItems||[]).map((item,index)=>({item,index})).filter(x=>Number(x.item.sourcePage)===page);
  if(!positions.length||positions.length<(history.afterItems?.length||0))throw new Error('page_item_count_changed_'+page);
  const sectionRank=new Map(), rowRank=new Map();
  candidates.forEach((candidate,i)=>{
   const key=section(candidate);
   if(!sectionRank.has(key))sectionRank.set(key,sectionRank.size+1);
   if(!rowRank.has(key))rowRank.set(key,0);
  });
  const used=new Set();
  const mapped=positions.map(({item,index})=>{
   const key=section(item);
   let matches=candidates.map((c,i)=>({c,i})).filter(({c,i})=>!used.has(i)&&norm(c.name)===norm(item.name)&&section(c)===key);
   if(matches.length!==1){
    const sameName=candidates.map((c,i)=>({c,i})).filter(({c,i})=>!used.has(i)&&norm(c.name)===norm(item.name));
    if(sameName.length===1)matches=sameName;
   }
   if(!matches.length||!sectionRank.has(key))throw new Error('ambiguous_item_page_'+page+'_index_'+index);
   const chosen=matches[0];used.add(chosen.i);
   return {index,item,candidateIndex:chosen.i,key};
  }).sort((a,b)=>a.candidateIndex-b.candidateIndex);
  for(const x of mapped){
   rowRank.set(x.key,(rowRank.get(x.key)||0)+1);
   const nextSection=sectionRank.get(x.key),nextRow=rowRank.get(x.key);
   if(x.item.sourceSectionOrder!==nextSection||x.item.sourceRowOrder!==nextRow)
    plan.push({index:x.index,page,name:x.item.name,section:keyToShort(x.key),from:[x.item.sourceSectionOrder,x.item.sourceRowOrder],to:[nextSection,nextRow]});
  }
 }
 function keyToShort(s){return s.slice(0,40)}
 const digest=crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
 if(!input.apply){console.log(JSON.stringify({mode:'dry_run',commit,revision:report.reviewRevision,pages:input.pages,
  changes:plan.length,digest,preview:plan.slice(0,12).map(x=>({index:x.index,page:x.page,name:x.name,from:x.from,to:x.to}))}));return;}
 if(!plan.length)throw new Error('no_changes');
 const audit=db.collection('ai_control_audit');
 if(await audit.findOne({action:'repair_report_supplement_order',target:input.reportId,status:{$in:['pending','applied']}}))throw new Error('order_repair_already_recorded');
 await audit.insertOne({_id:input.operationId,action:'repair_report_supplement_order',target:input.reportId,
  status:'pending',at:new Date(),actorId:'codex-maintenance',reportRevision:input.revision,
  pages:input.pages,changes:plan.length,digest,reason:'Section numbers restarted across OCR crops; metadata only'});
 const set={};for(const x of plan){set['reportItems.'+x.index+'.sourceSectionOrder']=x.to[0];set['reportItems.'+x.index+'.sourceRowOrder']=x.to[1]}
 const saved=await db.collection('medicalreports').updateOne({_id:id,reviewRevision:input.revision,audit_status:'unaudited',
  'pageParseStatus.status':{$ne:'processing'}},{$set:set,$inc:{reviewRevision:1}});
 if(saved.modifiedCount!==1){await audit.updateOne({_id:input.operationId},{$set:{status:'conflict'}});throw new Error('report_changed_before_save')}
 await audit.updateOne({_id:input.operationId},{$set:{status:'applied',completedAt:new Date()}});
 console.log(JSON.stringify({mode:'applied',operationId:input.operationId,changes:plan.length,newRevision:input.revision+1,digest}));
})().catch(e=>{console.error('Order repair failed: '+e.message);process.exitCode=1}).finally(()=>mongoose.disconnect());
"""

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report-id', required=True)
    parser.add_argument('--pages', type=int, nargs='+', required=True)
    parser.add_argument('--expected-revision', type=int, required=True)
    parser.add_argument('--expected-server-commit')
    parser.add_argument('--operation-id')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if len(args.report_id) != 24 or any(c not in '0123456789abcdefABCDEF' for c in args.report_id):
        parser.error('invalid report ID')
    if len(set(args.pages)) != len(args.pages) or any(not 1 <= page <= 500 for page in args.pages):
        parser.error('invalid pages')
    if args.apply:
        try:
            uuid.UUID(args.operation_id or '')
        except ValueError:
            parser.error('--apply requires a UUID operation ID')
        if not args.expected_server_commit or len(args.expected_server_commit) != 40:
            parser.error('--apply requires the expected server commit')
    payload = dict(reportId=args.report_id, pages=args.pages, revision=args.expected_revision,
                   apply=args.apply, operationId=args.operation_id, expectedCommit=args.expected_server_commit)
    with connect() as ssh:
        command = 'cd /var/www/jiayicare && node -e ' + shlex.quote(JS) + ' ' + shlex.quote(json.dumps(payload))
        _, out, err = ssh.exec_command(command, timeout=45)
        print(out.read().decode())
        error = err.read().decode()
        if error:
            print(error, file=sys.stderr)
        raise SystemExit(out.channel.recv_exit_status())
