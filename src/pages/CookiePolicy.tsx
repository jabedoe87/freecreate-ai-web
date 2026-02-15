import LegalPageLayout from "@/components/LegalPageLayout";

const CookiePolicy = () => {
  return (
    <LegalPageLayout title="Cookie Policy">
      <p><strong>Effective Date:</strong> February 15, 2026</p>
      <p><strong>Business Name:</strong> FreeCreate AI</p>
      <p><strong>Contact:</strong> <a href="mailto:mich.vanhaute@gmail.com">mich.vanhaute@gmail.com</a></p>

      <p>
        This Cookie Policy explains what cookies are, how FreeCreate AI uses them on our website,
        and your choices regarding their use.
      </p>

      <h2>1. What Are Cookies?</h2>
      <p>
        Cookies are small text files that are stored on your device (computer, tablet, or mobile)
        when you visit a website. They are widely used to make websites work more efficiently,
        provide a better user experience, and give website owners useful information about how
        their site is being used.
      </p>

      <h2>2. Types of Cookies We Use</h2>

      <h3>a) Essential Cookies</h3>
      <p>
        These cookies are necessary for the website to function properly. They enable core
        functionality such as page navigation, secure areas access, and payment processing.
        The website cannot function properly without these cookies, and they cannot be disabled.
      </p>
      <p>Examples include:</p>
      <ul>
        <li>Session management cookies</li>
        <li>Authentication cookies</li>
        <li>Security cookies</li>
        <li>Payment processing cookies (Stripe)</li>
      </ul>

      <h3>b) Analytics Cookies</h3>
      <p>
        We may use analytics cookies to understand how visitors interact with our website. These
        cookies collect information anonymously and help us improve our website and services.
      </p>
      <p>
        Analytics cookies may track information such as pages visited, time spent on pages,
        and how you arrived at our website.
      </p>

      <h3>c) Functional Cookies</h3>
      <p>
        These cookies allow the website to remember choices you make (such as your preferred
        language or region) and provide enhanced, more personalised features.
      </p>

      <h2>3. Third-Party Cookies</h2>
      <p>
        Some cookies on our website may be set by third-party services that we use, such as:
      </p>
      <ul>
        <li><strong>Stripe</strong> – for secure payment processing.</li>
        <li><strong>Analytics providers</strong> – for website usage statistics (if applicable).</li>
      </ul>
      <p>
        These third parties have their own privacy and cookie policies, which we encourage you to review.
      </p>

      <h2>4. Your Cookie Choices</h2>
      <p>
        You have the right to control and manage cookies in several ways:
      </p>
      <ul>
        <li>
          <strong>Browser settings:</strong> Most web browsers allow you to control cookies through
          their settings. You can set your browser to refuse cookies, delete existing cookies, or
          alert you when a cookie is being set.
        </li>
        <li>
          <strong>Opt-out links:</strong> Some analytics providers offer opt-out mechanisms. For
          example, Google Analytics provides an opt-out browser add-on.
        </li>
      </ul>
      <p>
        Please note that disabling certain cookies may affect the functionality of our website and
        your ability to use certain features, including payment processing.
      </p>

      <h2>5. Changes to This Cookie Policy</h2>
      <p>
        We may update this Cookie Policy from time to time to reflect changes in our practices or
        for operational, legal, or regulatory reasons. Any updates will be posted on this page with
        a revised effective date.
      </p>

      <h2>6. More Information</h2>
      <p>
        For more information about how we handle your personal data, please refer to our{" "}
        <a href="/privacy-policy">Privacy Policy</a>.
      </p>

      <h2>7. Contact Us</h2>
      <p>
        If you have any questions about our use of cookies, please contact us at:
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

export default CookiePolicy;
