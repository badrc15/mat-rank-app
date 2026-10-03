window.App = window.App || {};
App.views = App.views || {};
App.rollDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
App.views.requests = {
 render(main) {
  const ui=App.state.ui;
  const draft=ui.rollDraft ||= { date:App.rollDate(), partners:[{opponentId:'',wins:0,losses:0,noWinner:0}] };
  if(ui.selectedRollPartner) { const row=draft.partners.find(p=>!p.opponentId); if(row) row.opponentId=String(ui.selectedRollPartner); else if(!draft.partners.some(p=>Number(p.opponentId)===ui.selectedRollPartner)) draft.partners.push({opponentId:String(ui.selectedRollPartner),wins:0,losses:0,noWinner:0}); ui.selectedRollPartner=null; }
  const partners=App.state.fighters.filter(f=>f.id!==App.state.me.id);
  const recent=new Set((App.state.recapsData?.recaps||[]).map(r=>r.opponent.id));
  partners.sort((a,b)=>Number(recent.has(b.id))-Number(recent.has(a.id)) || a.username.localeCompare(b.username));
  main.innerHTML=`<section class="recap-panel"><h1>Log today's rolls</h1><p>Train first. Record only the rounds you remember, whenever you're ready. No coach or phones needed during class.</p>
  <p>Partners review later. Only agreed wins and losses affect Elo; rounds with no winner do not.</p>
  ${ui.rollMessage?`<p role="status">${App.escapeHtml(ui.rollMessage)}</p>`:''}
  ${partners.length?`<form id="rollForm"><label for="rollDate">Training date</label><input id="rollDate" type="date" value="${App.escapeHtml(draft.date)}" max="${App.rollDate()}" required>
  ${draft.partners.map((p,i)=>`<fieldset><legend>Partner ${i+1}</legend><label for="partner${i}">Training partner</label><select id="partner${i}" data-row="${i}" data-key="opponentId" required><option value="">Choose a partner</option>${partners.map(f=>`<option value="${f.id}" ${Number(p.opponentId)===f.id?'selected':''}>${f.username}${recent.has(f.id)?' (recent)':''}</option>`).join('')}</select><div class="round-counts">${[['wins','My wins'],['losses','Their wins'],['noWinner','No winner']].map(([key,label])=>`<label>${label}<input type="number" min="0" max="20" step="1" required data-row="${i}" data-key="${key}" value="${App.escapeHtml(p[key])}"></label>`).join('')}</div><button type="button" class="btn btn-ghost" data-remove="${i}" ${draft.partners.length===1?'disabled':''}>Remove partner</button></fieldset>`).join('')}
  <button type="button" class="btn btn-ghost" id="addPartner" ${draft.partners.length>=20?'disabled':''}>Add another partner</button><button class="btn btn-primary" id="saveRolls" type="submit">Send recaps for review</button></form>`:'<p>No partners yet. Other registered fighters will appear here.</p>'}
  <p>One recap per partner per date, up to 20 rounds. Check Recaps first if your partner may already have logged them. No reminders are sent during training.</p></section>`;
  const form=main.querySelector('#rollForm'); if(!form)return;
  form.oninput=e=>{const el=e.target;if(el.id==='rollDate')draft.date=el.value;else if(el.dataset.key)draft.partners[Number(el.dataset.row)][el.dataset.key]=el.value;};
  main.querySelector('#addPartner').onclick=()=>{draft.partners.push({opponentId:'',wins:0,losses:0,noWinner:0});App.render();};
  main.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{draft.partners.splice(Number(b.dataset.remove),1);App.render();});
  form.onsubmit=async e=>{e.preventDefault();const button=main.querySelector('#saveRolls');button.disabled=true;
   try{await App.api.saveRecaps({date:draft.date,partners:draft.partners.map(p=>({opponentId:Number(p.opponentId),wins:Number(p.wins),losses:Number(p.losses),noWinner:Number(p.noWinner)}))});ui.rollDraft=null;ui.rollMessage='Recaps saved. Your partners can review them later.';await App.setTab('matches');}
   catch(err){ui.rollMessage=err.message;App.render();}
  };
 }
};
