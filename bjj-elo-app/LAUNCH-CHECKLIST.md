# UK launch readiness — 3 October 2026

Operator: Badr Choudhary · badrc124@gmail.com.
Audience: adults aged 18 or over for the initial release, as confirmed by the operator. No child or parent-managed child accounts are offered. Self-declaration does not prove age or remove the need to assess likely child access. Production signup remains closed pending the blockers below.

## Implemented and locally verified

- Durable SQLite configuration and additive migrations; sessions and profiles survive process restart.
- Improved password hashing, session expiry/revocation, CSRF controls, rate limits and security headers.
- Mandatory versioned signup terms acceptance; accessible preview terms/privacy/cookie pages.
- Export, password change, sign out all devices and password-confirmed account deletion.
- Essential authentication cookie only; third-party font requests removed.
- Manual online backup tool with SQLite integrity verification.

## Required decisions and unfinished work

These are actual gaps, not compliance features already implemented. Technical work alone cannot establish all legal or operational obligations.

1. **Future children's release (out of initial launch scope):** define the youngest supported age and implement an appropriate parent/guardian-managed onboarding and account relationship. Decide how guardians are verified and how a child obtains help, exercises rights and transitions to their own account. Do not equate a checkbox with verified parental authorisation. Under-13 data-protection consent rules depend on the lawful basis and do not create a universal minimum app age. No guardian workflow is implemented yet.
2. **Privacy and age assessment:** assess foreseeable child access despite adult-only terms; perform and record a DPIA and children's best-interests assessment. Current profile/roster/feed views expose profile fields, gym, division, weight and activity to every signed-in member. Replace this with appropriate age-aware visibility and restricted discovery, minimise children's personal data, evaluate profiling/ranking and streak incentives, and prevent unsafe adult/child contact. An account gate is not high privacy by itself.
3. **Online Safety Act:** assess scope (comments, profiles and interactions may make this a regulated user-to-user service), complete children's access, illegal-content and children's risk assessments, and implement applicable measures. Establish a responsible moderator, in-app reporting and blocking, proportionate moderation, complaint/appeal handling, records and review triggers. A mailto link is only an initial contact channel, not a complete moderation system. Use Ofcom's current toolkit and codes to determine measures for this specific service.
4. **UK GDPR / Data Protection Act 2018 / PECR:** document processing purposes and lawful bases, legitimate-interest assessments where used, retention and deletion rules, processors and data flows. Consider special-category implications of any health-related information. Verify the ICO data-protection fee requirement, processor contracts and overseas transfer safeguards. Essential cookies alone do not need an optional-consent banner; add actual consent controls before introducing optional tracking.
5. **Policies and operations:** review preview policies against actual behaviour and children’s age groups; confirm public service/contact information and consumer obligations. Establish request handling, proportionate identity checks, incident/breach handling, moderator availability and backup retention. Evaluate notification duties if a breach occurs. Do not publish unknown retention periods or processor arrangements as settled facts.
6. **Account recovery:** verify production email delivery and consider MFA for privileged/operator access. Resend Free is provisioned. Verified-email signup, private email attachment for legacy accounts, hashed single-use reset links, expiry, session revocation and abuse controls are implemented and tested. Live delivery is blocked because the operator has no sender domain.
7. **Infrastructure:** complete free Railway deployment with a persistent /data volume; inspect and reconcile any earlier Fly data without replacing it, deploy one instance, verify TLS and persistence, configure encrypted off-host backups and test restoration. The existing Fly trial is expired; production database contents and volume health remain unverified.
8. **Accessibility and security review:** test main flows with keyboard, screen reader, zoom and mobile; review abuse and authorisation across all match/social endpoints. Local account tests are not a full penetration test or accessibility conformance assessment.

## Verified official references

- ICO cookie and privacy notices: https://ico.org.uk/for-organisations/advice-for-small-organisations/privacy-notices-and-cookies/cookies-and-privacy-notices-in-detail/
- ICO Children’s Code standards: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/code-standards/
- ICO best interests assessment: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/how-to-use-our-guidance-for-standard-one-best-interests-of-the-child/best-interests-assessment/
- Ofcom guide for services: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/guide-for-services
- Ofcom children’s access assessment tool: https://www.ofcom.org.uk/os-toolkit/child-access-assessment/childrens-access-assessment-tool
- OWASP password storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

## Current operator decisions

- Adults-only launch, confirmed 3 October 2026. Adult declaration is required and recorded at signup.
- No sender domain owned: live account email delivery and public signup are blocked.
- No public contact postal address provided: confirm applicable service-provider disclosure requirements before launch.
- Railway Free and Resend Free provisioned; no paid plan selected.
- A cookie notice popup describes essential cookies; dismissal is stored locally and is not optional tracking consent.
