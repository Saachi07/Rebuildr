export default function Terms() {
  return (
    <div className="legal">
      <h1>Terms of Service</h1>
      <p className="muted">Last updated: 2026-06-08</p>

      <p>
        Welcome to Rebuildr. By creating an account or using the service,
        you agree to these terms. Rebuildr helps you organize damage
        inventory, parse insurance documents, and surface relief resources;
        it is not a substitute for legal or insurance advice.
      </p>

      <h2>Your account</h2>
      <p>
        You are responsible for maintaining the confidentiality of your
        credentials and for any activity that occurs under your account.
      </p>

      <h2>Your content</h2>
      <p>
        You retain ownership of photos, documents, and inventory you upload.
        You grant Rebuildr a limited license to process this content solely
        to provide the service.
      </p>

      <h2>Data processors</h2>
      <p>
        Rebuildr stores your data with <strong>Supabase</strong> (database,
        authentication, and object storage) and uses{" "}
        <strong>Google Gemini</strong> to analyze uploaded photos and
        documents. By using Rebuildr you consent to these processors
        handling your data on our behalf.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don't upload content you don't have rights to, attempt to access
        other users' data, or use the service to harm others.
      </p>

      <h2>Disclaimer</h2>
      <p>
        The service is provided "as is" without warranties. Recovery plans
        and resource matches are informational only.
      </p>

      <h2>Contact</h2>
      <p>Questions? Email support@rebuildr.app.</p>
    </div>
  );
}
