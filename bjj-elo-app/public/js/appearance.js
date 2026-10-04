window.App = window.App || {};
App.avatar = function(f,size='small') {
  const name=App.escapeHtml(f.username||'Fighter');
  const content=f.avatarUrl ? `<img src="${App.escapeHtml(f.avatarUrl)}" alt="${name}'s profile photo" width="512" height="512" loading="lazy">` : `<span aria-hidden="true">${App.escapeHtml((f.username||'?').trim().slice(0,1).toUpperCase())}</span>`;
  return `<button class="avatar avatar-${size}" data-profile="${f.id}" aria-label="View ${name}'s profile">${content}</button>`;
};
App.wireProfiles = function(scope) {
  scope.querySelectorAll('[data-profile]').forEach(button=>button.onclick=()=>App.openFighter(Number(button.dataset.profile),button));
};
App.openFighter = function(id,trigger) {
  const f=App.state.fighters.find(f=>f.id===id);if(!f)return;
  document.querySelector('#fighterDialog')?.remove();
  const esc=App.escapeHtml,rank=App.state.fighters.slice().sort((a,b)=>b.elo-a.elo).findIndex(x=>x.id===id)+1;
  const dialog=document.createElement('dialog');dialog.id='fighterDialog';dialog.className='fighter-dialog';dialog.setAttribute('aria-labelledby','fighterTitle');
  dialog.innerHTML=`<div class="fighter-cover profile-banner-${esc(f.style?.banner||'classic')}"><button class="dialog-close btn btn-ghost" aria-label="Close profile">✕</button><span class="eyebrow">MAT RANK ${f.style?'PLUS':''}</span></div><div class="fighter-detail">${f.avatarUrl?`<img class="portrait" src="${esc(f.avatarUrl)}" alt="${esc(f.username)}'s profile photo" width="512" height="512">`:`<div class="portrait portrait-fallback" aria-hidden="true">${esc(f.username.slice(0,1).toUpperCase())}</div>`}<h2 id="fighterTitle">${f.username}</h2><p>${esc(App.beltMeta(f.belt).label)} belt${f.gym?' · '+f.gym:''}${f.weight?' · '+esc(f.weight)+' kg':''}</p><div class="profile-numbers"><div><b>${f.elo}</b><span>Elo rating</span></div><div><b>#${rank}</b><span>Overall rank</span></div><div><b>${f.matchesPlayed}</b><span>Rounds at this belt</span></div></div><p>${f.streak.longest} day best training streak</p><button class="btn btn-primary" id="profileAction">${id===App.state.me.id?'Edit my profile':'Log rolls together'}</button></div>`;
  document.body.append(dialog);dialog.showModal();
  const close=()=>dialog.close();dialog.querySelector('.dialog-close').onclick=close;
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
  dialog.addEventListener('close',()=>{dialog.remove();trigger?.focus();});
  dialog.querySelector('#profileAction').onclick=async()=>{close();if(id!==App.state.me.id)App.state.ui.selectedRollPartner=id;await App.setTab(id===App.state.me.id?'profile':'requests');};
};
App.wirePhotoEditor = function(scope) {
  const input=scope.querySelector('#photoInput'),status=scope.querySelector('#photoStatus'),remove=scope.querySelector('#removePhoto');
  async function save(operation){
    App.state.ui.photoBusy=true;input.disabled=true;remove.disabled=true;status.textContent='Saving photo…';
    try {await operation();await App.refreshTab('profile');document.querySelector('#photoStatus').textContent='Photo saved.';}
    catch(e){status.textContent=e.message;input.disabled=false;remove.disabled=!App.state.me.avatarUrl;}
    finally {App.state.ui.photoBusy=false;}
  }
  input.onchange=()=>{const file=input.files[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024){status.textContent='Choose a JPEG, PNG or WebP under 2 MB.';input.value='';return;}
    save(async()=>{const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read this photo.'));reader.readAsDataURL(file);});await App.api.uploadAvatar(image);});
  };
  remove.onclick=()=>save(()=>App.api.removeAvatar());
};
