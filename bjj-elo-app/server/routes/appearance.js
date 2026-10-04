const db = require('../db');
const sharp = require('sharp');
const { requireAuth } = require('../auth');
const { sendJson } = require('../router');
const { rateLimit } = require('../security');
let processing = 0;
module.exports = router => {
  router.post('/api/me/avatar', async (req,res,{body}) => {
    const id=requireAuth(req);
    if(!id)return sendJson(res,401,{error:'Not authenticated'});
    if(rateLimit(req,res,'avatar',15,3600000,String(id)))return;
    const match=typeof body.image==='string' && body.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if(!match)return sendJson(res,400,{error:'Choose a JPEG, PNG or WebP image.'});
    const input=Buffer.from(match[2],'base64');
    if(input.length>2*1024*1024)return sendJson(res,413,{error:'Choose an image under 2 MB.'});
    if(processing>=2)return sendJson(res,503,{error:'Photo processing is busy. Please try again shortly.'});
    processing++;
    try {
      const image=sharp(input,{limitInputPixels:20000000,failOn:'warning'});
      const meta=await image.metadata();
      if(!['jpeg','png','webp'].includes(meta.format)||(meta.pages||1)>1)throw new Error('Unsupported image');
      const data=await image.rotate().resize(512,512,{fit:'cover'}).webp({quality:82}).toBuffer();
      // Recheck ownership after asynchronous processing: deleted accounts stay deleted.
      if(!requireAuth(req))return sendJson(res,401,{error:'Not authenticated'});
      const version=require('crypto').randomBytes(12).toString('hex');
      db.prepare('INSERT INTO profile_photos(fighter_id,image,version) VALUES(?,?,?) ON CONFLICT(fighter_id) DO UPDATE SET image=excluded.image,version=excluded.version').run(id,data,version);
      sendJson(res,200,{ok:true});
    } catch {sendJson(res,400,{error:'This image could not be read. Choose a still JPEG, PNG or WebP under 20 megapixels.'});}
    finally {processing--;}
  });
  router.del('/api/me/avatar',async(req,res)=>{
    const id=requireAuth(req);if(!id)return sendJson(res,401,{error:'Not authenticated'});
    db.prepare('DELETE FROM profile_photos WHERE fighter_id=?').run(id);sendJson(res,200,{ok:true});
  });
  router.get('/api/fighters/:id/avatar',async(req,res,{params})=>{
    if(!requireAuth(req))return sendJson(res,401,{error:'Not authenticated'});
    const photo=db.prepare('SELECT image FROM profile_photos WHERE fighter_id=?').get(params.id);
    if(!photo)return sendJson(res,404,{error:'Photo not found'});
    res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(photo.image));
  });
};
