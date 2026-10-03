window.App = window.App || {};
App.views = App.views || {};
App.views.account = {
  render(root) {
    root.innerHTML = `<section class="account-panel"><h1>Account & privacy</h1>
      <p>Your account is saved on the server. Refreshing this page does not delete it.</p>
      <h2>Private account email</h2><p id="emailStatus" role="status">Loading email status…</p>
      <form id="emailForm" hidden><p>Older accounts can add a recovery email. Verify it using the link we send; you will then sign in with that email.</p>
      <label for="accountEmail">Email address</label><input id="accountEmail" type="email" required maxlength="254" autocomplete="email">
      <label for="emailPassword">Current password</label><input id="emailPassword" type="password" required maxlength="128" autocomplete="current-password">
      <button class="primary">Send verification email</button></form>
      <h2>Change password</h2><p>Use a unique passphrase of 15–128 characters. Changing it signs out your other devices.</p>
      <form id="passwordForm"><label for="currentPassword">Current password</label><input id="currentPassword" type="password" autocomplete="current-password" required maxlength="128">
      <label for="newPassword">New password</label><input id="newPassword" type="password" autocomplete="new-password" required minlength="15" maxlength="128">
      <button class="primary">Change password</button></form>
      <p id="accountStatus" role="status"></p>
      <h2>Your sessions</h2><p>Sign-in expires after seven days. Use this if you have lost a device or used a shared computer.</p><button id="logoutAll">Sign out every device</button>
      <h2>Your information</h2><p>Download your account details, match records and content. Password hashes and session secrets are never included.</p>
      <p><a href="/api/me/export" download>Download my data (JSON)</a></p>
      <h2>Delete account</h2><p>This permanently removes your profile, comments, likes and pending requests from the live database and signs out every device. Completed match records remain for opponents under “Deleted account”; people who knew you may still recognise those matches. Backup copies expire under the operator's retention policy.</p>
      <form id="deleteForm"><label for="deletePassword">Current password</label><input id="deletePassword" type="password" autocomplete="current-password" required maxlength="128">
      <label for="deleteConfirm">Type DELETE to confirm</label><input id="deleteConfirm" required pattern="DELETE" autocomplete="off">
      <button class="danger">Permanently delete my account</button></form>
      <h2>Help or report a concern</h2><p>Contact <a href="mailto:badrc124@gmail.com">badrc124@gmail.com</a> about privacy, harmful content, account access or a complaint. Include the relevant nickname or match number, but never your password. Young athletes can ask a trusted adult to help.</p>
      </section>`;
    const status = document.getElementById('accountStatus');
    const emailStatus=root.querySelector('#emailStatus'),emailForm=root.querySelector('#emailForm');
    App.api.getEmail().then(data=>{emailStatus.textContent=data.email?`Verified email: ${data.email}`:'No recovery email has been added yet.';emailForm.hidden=Boolean(data.email);}).catch(err=>{emailStatus.textContent=err.message;});
    emailForm.onsubmit=async e=>{
      e.preventDefault();const button=emailForm.querySelector('button');button.disabled=true;
      try{const result=await App.api.addEmail(root.querySelector('#accountEmail').value.trim(),root.querySelector('#emailPassword').value);emailStatus.textContent=result.message;emailForm.reset();}
      catch(err){emailStatus.textContent=err.message;}finally{button.disabled=false;}
    };
    document.getElementById('passwordForm').onsubmit = async e => {
      e.preventDefault();
      const button = e.currentTarget.querySelector('button'); button.disabled = true;
      try {
        await App.api.changePassword(document.getElementById('currentPassword').value, document.getElementById('newPassword').value);
        document.getElementById('passwordForm').reset(); status.textContent = 'Password changed. Other devices have been signed out.';
      } catch (err) { status.textContent = err.message; }
      finally { button.disabled = false; }
    };
    document.getElementById('logoutAll').onclick = async () => {
      try { await App.api.logoutAll(); await App.logout(); } catch (err) { status.textContent = err.message; }
    };
    document.getElementById('deleteForm').onsubmit = async e => {
      e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true;
      try {
        await App.api.deleteAccount(document.getElementById('deletePassword').value, document.getElementById('deleteConfirm').value);
        await App.logout();
      } catch (err) { status.textContent = err.message; button.disabled = false; }
    };
  }
};
