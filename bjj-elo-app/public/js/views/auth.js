window.App = window.App || {};
App.views = App.views || {};
App.views.auth = {
  render(root) {
    const ui = App.state.ui, mode=ui.authMode || 'login';
    const register=mode==='register', forgot=mode==='forgot', reset=mode==='reset', verify=mode==='verify';
    const title=register?'Create your account':forgot?'Forgot password?':reset?'Set a new password':verify?'Verify your email':'Welcome back';
    root.innerHTML=`<div class="gate"><div class="gate-mark"></div><h1>Mat Rank</h1>
      <p>Train first. Log your rolls afterwards. For adults aged 18 and over.</p>
      <div class="auth-tabs"><button type="button" class="auth-tab ${mode==='login'?'active':''}" data-mode="login">Sign in</button><button type="button" class="auth-tab ${register?'active':''}" data-mode="register">Create account</button></div>
      <h2>${title}</h2>
      <p id="authStatus" role="status" class="auth-hint">${App.escapeHtml(ui.authMessage||'')}</p>
      <p id="authError" role="alert" class="auth-error">${App.escapeHtml(ui.authError||'')}</p>
      ${register && App.config?.signupsEnabled===false?'<p class="auth-hint">Registration is not open yet. Email delivery and launch checks are being completed.</p>':''}
      ${forgot?'<p>Enter your account email. We will send a single-use link to reset your password. Older accounts must first add an email in Account &amp; privacy.</p>':''}
      ${verify?'<p>Only continue if you requested this account or email verification. Verifying does not sign you in.</p>':''}
      <form id="authForm">
        ${register?'<label for="authUsername">Fighter nickname</label><input id="authUsername" name="nickname" placeholder="A nickname, not your full name" required minlength="2" maxlength="30" autocomplete="nickname">':''}
        ${!reset&&!verify?`<label for="authEmail">${mode==='login'?'Email (or nickname for an older account)':'Email address'}</label><input id="authEmail" name="email" type="${mode==='login'?'text':'email'}" required maxlength="254" autocomplete="${mode==='login'?'username':'email'}" autocapitalize="none" spellcheck="false">`:''}
        ${!forgot&&!verify?`<label for="authPassword">${reset?'New password':'Password'}</label><input id="authPassword" name="password" type="password" required ${mode==='login'?'':'minlength="15"'} maxlength="128" autocomplete="${mode==='login'?'current-password':'new-password'}">`:''}
        ${register||reset?'<label for="confirmPassword">Confirm password</label><input id="confirmPassword" type="password" required minlength="15" maxlength="128" autocomplete="new-password"><p class="auth-hint">Use a unique passphrase of 15–128 characters.</p>':''}
        ${register?'<label class="consent"><input type="checkbox" id="adult" required><span>I am aged 18 or over and this account is for me.</span></label><label class="consent"><input type="checkbox" id="acceptTerms" required><span>I agree to the <a href="/terms.html" target="_blank" rel="noopener">Terms and Conditions</a> and have read the <a href="/privacy.html" target="_blank" rel="noopener">Privacy Notice</a>.</span></label><p class="auth-hint">Your email stays private. We use it for account verification and security, not marketing.</p>':''}
        <button type="submit" class="primary" id="authSubmit" ${register&&App.config?.signupsEnabled===false?'disabled':''}>${register?'Send verification email':forgot?'Send reset link':reset?'Reset password':verify?'Verify email':'Sign in'}</button>
      </form>
      ${mode==='login'?'<button type="button" id="forgotPassword" class="auth-link">Forgot password?</button>':''}
      ${forgot||reset||verify?'<button type="button" data-mode="login" class="auth-link">Back to sign in</button>':''}
    </div>`;
    root.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{
      ui.authMode=button.dataset.mode;ui.authError=null;ui.authMessage=null;ui.authToken=null;App.render();
    });
    const forgotButton=root.querySelector('#forgotPassword');
    if(forgotButton)forgotButton.onclick=()=>{ui.authMode='forgot';ui.authError=null;ui.authMessage=null;App.render();};
    root.querySelector('#authForm').onsubmit=async event=>{
      event.preventDefault();const button=root.querySelector('#authSubmit'),error=root.querySelector('#authError'),status=root.querySelector('#authStatus');
      const password=root.querySelector('#authPassword')?.value,email=root.querySelector('#authEmail')?.value.trim();
      if((register||reset)&&password!==root.querySelector('#confirmPassword').value){error.textContent='The passwords do not match.';return;}
      button.disabled=true;error.textContent='';status.textContent='Please wait…';
      try {
        if(mode==='login'){
          const {fighter}=await App.api.login(email,password);App.state.me=fighter;ui.authMessage=null;await App.enterApp();return;
        }
        let result;
        if(register) result=await App.api.register(root.querySelector('#authUsername').value.trim(),password,{email,adult:root.querySelector('#adult').checked,acceptTerms:root.querySelector('#acceptTerms').checked,termsVersion:App.config?.termsVersion,privacyVersion:App.config?.privacyVersion});
        else if(forgot)result=await App.api.forgotPassword(email);
        else if(reset)result=await App.api.resetPassword(ui.authToken,password);
        else if(verify)result=await App.api.verifyEmail(ui.authToken);
        ui.authMessage=result.message;ui.authError=null;
        if(reset||verify){ui.authToken=null;ui.authMode='login';App.state.me=null;}
        App.render();
      }catch(err){error.textContent=err.message;status.textContent='';button.disabled=false;}
    };
  }
};
