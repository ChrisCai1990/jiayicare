"""Audited, single-page AI allowance and circuit recovery for an unaudited report.

Dry run by default. Requires an explicit operation ID for --apply so an uncertain
SSH outcome cannot be retried under a different audit identity.
"""
import argparse
import json
import shlex
import sys
import uuid

from ssh_config import connect

JS = r"""
require('dotenv').config({path:'backend/.env',quiet:true});
const mongoose=require('mongoose');
(async()=>{
 const input=JSON.parse(process.argv[1]);
 const serverCommit=require('child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(input.apply && serverCommit!==input.expectedServerCommit) throw new Error('server_commit_changed');
 await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});
 const db=mongoose.connection.db;
 const report=await db.collection('medicalreports').findOne({_id:new mongoose.Types.ObjectId(input.reportId)},
  {projection:{audit_status:1,aiStatus:1,reviewRevision:1,parseJob:1,pageParseStatus:1,reportItems:1}});
 if(!report) throw new Error('report_not_found');
 const pageItems=(Array.isArray(report.reportItems)?report.reportItems:[])
  .filter(item=>Number(item.sourcePage||item.pageNum||item.page)===input.page).length;
 if(report.audit_status==='audited'||report.aiStatus==='processing'||report.parseJob?.status==='processing'
    ||report.pageParseStatus?.status==='processing'||pageItems!==0
    ||Number(report.reviewRevision||0)!==input.expectedRevision) throw new Error('report_state_changed');
 const scope='page:'+input.reportId+':'+input.page;
 const circuitKey='qwen:qwen3-vl-plus:report:'+input.reportId+':page:'+input.page;
 const counter=await db.collection('ai_budget_counters').findOne({_id:scope});
 const circuit=await db.collection('ai_circuits').findOne({_id:circuitKey});
 if(!counter||!circuit) throw new Error('page_control_missing');
 if(Boolean(circuit.paused)!==input.resetCircuit) throw new Error('circuit_state_changed');
 const before={tokens:Number(counter.tokens||0),calls:Number(counter.calls||0),
  extraTokens:Number(counter.extraTokens||0),extraCalls:Number(counter.extraCalls||0),
  circuitFailures:Number(circuit.failures||0),circuitPaused:Boolean(circuit.paused)};
 if(!input.apply){
  console.log(JSON.stringify({mode:'dry_run',serverCommit,reportId:input.reportId,page:input.page,revision:report.reviewRevision,
   pageItems,before,requested:{extraTokens:input.extraTokens,extraCalls:input.extraCalls,resetCircuit:input.resetCircuit}}));return;
 }
 const audit=db.collection('ai_control_audit');
 if(await audit.findOne({action:'recover_report_page_ai',target:scope,status:{$in:['pending','partial','applied']}}))
  throw new Error('page_recovery_already_recorded');
 await audit.insertOne({_id:input.operationId,action:'recover_report_page_ai',target:scope,
  status:'pending',at:new Date(),actorId:'codex-maintenance',reportRevision:input.expectedRevision,
  before,requested:{extraTokens:input.extraTokens,extraCalls:input.extraCalls,resetCircuit:input.resetCircuit},
  reason:'Repeated OCR model timeouts; size-aware page supplement prepared'});
 const updated=await db.collection('ai_budget_counters').updateOne({_id:scope,
  tokens:before.tokens,calls:before.calls,extraTokens:before.extraTokens,extraCalls:before.extraCalls},
  {$inc:{extraTokens:input.extraTokens,extraCalls:input.extraCalls},$set:{updatedAt:new Date()}});
 if(updated.modifiedCount!==1){await audit.updateOne({_id:input.operationId},{$set:{status:'conflict'}});throw new Error('counter_changed');}
 if(input.resetCircuit){
  const reset=await db.collection('ai_circuits').updateOne({_id:circuitKey,paused:true,failures:before.circuitFailures},
   {$set:{paused:false,failures:0,updatedAt:new Date()}});
  if(reset.modifiedCount!==1){await audit.updateOne({_id:input.operationId},{$set:{status:'partial'}});throw new Error('circuit_changed_after_allowance');}
 }
 await audit.updateOne({_id:input.operationId},{$set:{status:'applied',completedAt:new Date()}});
 console.log(JSON.stringify({mode:'applied',operationId:input.operationId,reportId:input.reportId,page:input.page,
  addedTokens:input.extraTokens,addedCalls:input.extraCalls,circuitReset:input.resetCircuit}));
})().catch(e=>{console.error('Page recovery failed: '+e.message);process.exitCode=1}).finally(()=>mongoose.disconnect());
"""

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report-id', required=True)
    parser.add_argument('--page', type=int, required=True)
    parser.add_argument('--expected-revision', type=int, required=True)
    parser.add_argument('--extra-tokens', type=int, required=True)
    parser.add_argument('--extra-calls', type=int, required=True)
    parser.add_argument('--reset-circuit', action='store_true')
    parser.add_argument('--operation-id')
    parser.add_argument('--expected-server-commit')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if len(args.report_id) != 24 or any(c not in '0123456789abcdefABCDEF' for c in args.report_id):
        parser.error('invalid report ID')
    if not 1 <= args.page <= 500 or args.expected_revision < 0 or not 1 <= args.extra_tokens <= 1000000 or not 1 <= args.extra_calls <= 100:
        parser.error('invalid recovery values')
    if args.apply:
        try: uuid.UUID(args.operation_id or '')
        except ValueError: parser.error('--apply requires a UUID --operation-id')
        if not args.expected_server_commit or len(args.expected_server_commit) != 40 or any(c not in '0123456789abcdefABCDEF' for c in args.expected_server_commit):
            parser.error('--apply requires a 40-character --expected-server-commit')
    payload = dict(reportId=args.report_id, page=args.page, expectedRevision=args.expected_revision,
                   extraTokens=args.extra_tokens, extraCalls=args.extra_calls,
                   resetCircuit=args.reset_circuit, operationId=args.operation_id,
                   expectedServerCommit=args.expected_server_commit, apply=args.apply)
    with connect() as ssh:
        command = 'cd /var/www/jiayicare && node -e ' + shlex.quote(JS) + ' ' + shlex.quote(json.dumps(payload))
        _, out, err = ssh.exec_command(command, timeout=45)
        print(out.read().decode('utf-8'))
        error = err.read().decode('utf-8')
        if error: print(error, file=sys.stderr)
        raise SystemExit(out.channel.recv_exit_status())
