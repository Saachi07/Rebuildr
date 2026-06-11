export default function Privacy() {
  return (
    <div className="legal">
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: 2026-06-08</p>

      <p>
        This policy explains what we collect, how we use it, and who we
        share it with.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account info: email address and authentication state.</li>
        <li>Recovery data: cases, inventory items, and uploaded documents/photos.</li>
        <li>Usage data: minimal logs needed to operate and debug the service.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To provide the service: store your records, parse documents into
        structured data, match you with resources, and secure your account.
      </p>

      <h2>Data processors</h2>
      <p>
        We use <strong>Supabase</strong> for database, authentication, and
        encrypted file storage. We use <strong>Google Gemini</strong> to
        analyze uploaded photos and PDF documents. These processors
        receive only the data needed to perform their function.
      </p>

      <h2>Encryption</h2>
      <p>
        Data is encrypted in transit (HTTPS) and at rest in our storage
        provider. Document files are stored in a private bucket and served
        through short-lived signed URLs.
      </p>

      <h2>Your rights</h2>
      <p>
        You can delete documents and cases at any time. Email
        privacy@rebuildr.app to request full account deletion or a copy of
        your data.
      </p>

      <h2>Contact</h2>
      <p>Questions? Email privacy@rebuildr.app.</p>
    </div>
  );
}
