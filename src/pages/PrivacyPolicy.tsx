import LegalPageLayout from "@/components/LegalPageLayout";

const PrivacyPolicy = () => {
  return (
    <LegalPageLayout title="Privacy Policy">
      <p><strong>Effective Date:</strong> February 15, 2026</p>
      <p><strong>Business Name:</strong> FreeCreate AI</p>
      <p><strong>Owner:</strong> Michael Van Haute</p>
      <p><strong>Location:</strong> Belgium</p>
      <p><strong>Contact:</strong> <a href="mailto:mich.vanhaute@gmail.com">mich.vanhaute@gmail.com</a></p>

      <p>
        FreeCreate AI ("we", "us", "our") is committed to protecting your personal data.
        This Privacy Policy explains what information we collect, how we use it, and your
        rights under the General Data Protection Regulation (GDPR) and other applicable laws.
      </p>

      <h2>1. Information We Collect</h2>
      <p>We may collect the following personal data when you use our website or purchase our products:</p>
      <ul>
        <li><strong>Name</strong> – provided during account creation or checkout.</li>
        <li><strong>Email address</strong> – used for account creation, product delivery, and communication.</li>
        <li><strong>Payment information</strong> – processed securely by Stripe. We do not store your credit card details on our servers.</li>
        <li><strong>Usage data</strong> – such as IP address, browser type, and pages visited, collected through cookies and analytics tools.</li>
      </ul>

      <h2>2. How We Use Your Data</h2>
      <p>Your personal data is used for the following purposes:</p>
      <ul>
        <li>To create and manage your account.</li>
        <li>To process payments and deliver digital products.</li>
        <li>To provide customer support and respond to inquiries.</li>
        <li>To improve our website and services.</li>
        <li>To comply with legal obligations.</li>
      </ul>

      <h2>3. Payment Processing</h2>
      <p>
        All payments are securely processed through <strong>Stripe</strong>, a PCI-DSS compliant
        payment processor. We do not have access to or store your full credit card information.
        Stripe's privacy policy can be found at{" "}
        <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
          stripe.com/privacy
        </a>.
      </p>

      <h2>4. Data Sharing</h2>
      <p>
        We do not sell, trade, or rent your personal information to third parties. We may share
        data with trusted service providers (such as Stripe) solely for the purpose of operating
        our business and delivering our services.
      </p>

      <h2>5. Data Retention</h2>
      <p>
        We retain your personal data only for as long as necessary to fulfill the purposes outlined
        in this policy, or as required by law. Transaction records are kept for a minimum of 7 years
        in accordance with Belgian tax and accounting regulations. You may request deletion of your
        personal data at any time by contacting us.
      </p>

      <h2>6. Your Rights Under GDPR</h2>
      <p>As a resident of the European Union, you have the following rights regarding your personal data:</p>
      <ul>
        <li><strong>Right of access</strong> – You can request a copy of the personal data we hold about you.</li>
        <li><strong>Right to rectification</strong> – You can request correction of inaccurate or incomplete data.</li>
        <li><strong>Right to erasure</strong> – You can request deletion of your personal data ("right to be forgotten").</li>
        <li><strong>Right to restrict processing</strong> – You can request that we limit the processing of your data.</li>
        <li><strong>Right to data portability</strong> – You can request your data in a structured, machine-readable format.</li>
        <li><strong>Right to object</strong> – You can object to processing based on legitimate interests or direct marketing.</li>
        <li><strong>Right to withdraw consent</strong> – Where processing is based on consent, you may withdraw it at any time.</li>
      </ul>
      <p>
        To exercise any of these rights, please contact us at{" "}
        <a href="mailto:mich.vanhaute@gmail.com">mich.vanhaute@gmail.com</a>. We will respond
        within 30 days.
      </p>

      <h2>7. Data Security</h2>
      <p>
        We implement appropriate technical and organisational measures to protect your personal data
        against unauthorised access, alteration, disclosure, or destruction. This includes the use of
        SSL/TLS encryption, secure payment processing via Stripe, and restricted access to personal data.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Our website uses cookies to enhance your browsing experience. For detailed information about
        the cookies we use, please refer to our{" "}
        <a href="/cookie-policy">Cookie Policy</a>.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We reserve the right to update this Privacy Policy at any time. Any changes will be posted on
        this page with an updated effective date. We encourage you to review this policy periodically.
      </p>

      <h2>10. Contact Us</h2>
      <p>
        If you have any questions or concerns about this Privacy Policy or the handling of your personal
        data, please contact us at:
      </p>
      <p>
        <strong>FreeCreate AI</strong><br />
        Michael Van Haute<br />
        Belgium<br />
        Email: <a href="mailto:mich.vanhaute@gmail.com">mich.vanhaute@gmail.com</a>
      </p>
    </LegalPageLayout>
  );
};

export default PrivacyPolicy;
