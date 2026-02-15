import LegalPageLayout from "@/components/LegalPageLayout";

const RefundPolicy = () => {
  return (
    <LegalPageLayout title="Refund Policy">
      <p><strong>Effective Date:</strong> February 15, 2026</p>
      <p><strong>Business Name:</strong> FreeCreate AI</p>
      <p><strong>Contact:</strong> <a href="mailto:mich.vanhaute@gmail.com">mich.vanhaute@gmail.com</a></p>

      <p>
        Thank you for purchasing from FreeCreate AI. We take pride in delivering high-quality
        digital products. Please read our refund policy carefully before making a purchase.
      </p>

      <h2>1. Digital Products – No Refunds After Access</h2>
      <p>
        Because all products sold by FreeCreate AI are digital in nature and are delivered
        electronically, <strong>refunds are generally not provided</strong> once you have
        downloaded or gained access to a product.
      </p>
      <p>
        By completing a purchase, you acknowledge that you are buying a digital product and
        that the right to withdraw is waived upon delivery of the digital content, in accordance
        with EU consumer rights regulations (Directive 2011/83/EU, Article 16(m)).
      </p>

      <h2>2. Exceptions</h2>
      <p>We may consider a refund or replacement in the following circumstances:</p>
      <ul>
        <li>
          <strong>Technical issues:</strong> If the product is defective, corrupted, or cannot be
          accessed due to a technical error on our end, please contact us within 14 days of purchase
          with proof of the issue.
        </li>
        <li>
          <strong>Duplicate purchase:</strong> If you were accidentally charged twice for the same
          product, we will issue a full refund for the duplicate charge.
        </li>
        <li>
          <strong>Product not as described:</strong> If the product significantly differs from its
          description on our website, you may be eligible for a refund upon review.
        </li>
      </ul>

      <h2>3. How to Request a Refund</h2>
      <p>
        To request a refund, please contact us at{" "}
        <a href="mailto:mich.vanhaute@gmail.com">mich.vanhaute@gmail.com</a> with the
        following information:
      </p>
      <ul>
        <li>Your full name</li>
        <li>Order number or transaction ID</li>
        <li>Date of purchase</li>
        <li>Reason for the refund request</li>
        <li>Any supporting evidence (e.g., screenshots of technical issues)</li>
      </ul>
      <p>
        We will review your request and respond within 7 business days.
      </p>

      <h2>4. Disputes</h2>
      <p>
        If you are unable to resolve an issue directly with us, payment disputes may be handled
        through <strong>Stripe's</strong> dispute resolution process. We encourage customers to
        contact us first before initiating a dispute with their payment provider, as we are
        committed to finding a fair resolution.
      </p>

      <h2>5. Contact Us</h2>
      <p>
        If you have any questions about our refund policy, please reach out to us:
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

export default RefundPolicy;
