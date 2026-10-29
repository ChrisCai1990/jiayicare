const express=require('express'),mongoose=require('mongoose');
const adminAuth=require('../middleware/adminAuth');
const Archive=require('../models/AccountDeletionFinancialArchive');
const Access=require('../models/AccountDeletionArchiveAccess');
const {readFinancialArchive}=require('../utils/accountDeletionArchiveAccess');
const Request=require('../models/AccountDeletionRequest');
const {listDeletionQueue}=require('../utils/accountDeletionQueue');
const router=express.Router();
router.use(adminAuth);
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/requests',async(req,res,next)=>{
 try {
  const data=await listDeletionQueue({actor:req.admin,query:req.query,requests:Request.collection});
  res.json({success:true,data});
 } catch(error) {if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}
});
router.post('/financial-archives/:id/read',async(req,res,next)=>{
 try {
  const data=await readFinancialArchive({actor:req.admin,archiveId:req.params.id,purpose:req.body?.purpose,reason:req.body?.reason,
    archives:{findOne:q=>Archive.collection.findOne(q),objectId:id=>new mongoose.Types.ObjectId(id)},audit:Access.collection});
  res.json({success:true,data});
 } catch(error) {if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}
});
module.exports=router;
