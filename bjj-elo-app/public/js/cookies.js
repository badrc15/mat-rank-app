(function(){
  const version='2026-10-03';
  let acknowledged=false;
  try{acknowledged=localStorage.getItem('matrank_cookie_notice')===version;}catch{}
  function show(){
    if(document.getElementById('cookieNotice'))return;
    const panel=document.createElement('section');panel.id='cookieNotice';panel.className='cookie-notice';
    panel.setAttribute('role','region');panel.setAttribute('aria-label','Cookie notice');
    panel.innerHTML='<h2>Cookies on Mat Rank</h2><p>We use an essential cookie to keep you signed in. No advertising or analytics cookies are used.</p><p><a href="/cookies.html">Read the Cookie Notice</a></p><button type="button" class="primary">Got it</button>';
    panel.querySelector('button').onclick=()=>{try{localStorage.setItem('matrank_cookie_notice',version);}catch{} panel.remove();};
    document.body.appendChild(panel);
  }
  if(!acknowledged)show();
  document.querySelectorAll('[data-cookie-notice]').forEach(button=>button.onclick=show);
})();
