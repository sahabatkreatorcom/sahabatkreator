import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Sahabat Kreator",
  description: "Terms and conditions of use for the Sahabat Kreator platform",
  alternates: {
    canonical: "https://sahabatkreator.com/en/syarat-ketentuan",
    languages: {
      "id-ID": "https://sahabatkreator.com/syarat-ketentuan",
      "en-US": "https://sahabatkreator.com/en/syarat-ketentuan",
    },
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPageEN() {
  return (
    <>
      <main className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated:{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>

        <div className="prose prose-lg dark:prose-invert mt-8 max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing and using the Sahabat Kreator platform, you agree to be bound
              by these Terms of Service. If you do not agree to any part of these terms,
              you are not permitted to access our platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">2. Service Description</h2>
            <p className="text-muted-foreground">
              Sahabat Kreator is an AI-powered social media management platform that provides
              features for account management, content scheduling, performance analytics,
              comment inbox management, competitor tracking, and AI assistance for content creators.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">3. Account Registration</h2>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>You must provide accurate and complete information during registration</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials</li>
              <li>You must notify us immediately of any unauthorized use of your account</li>
              <li>We reserve the right to suspend or terminate accounts that violate these terms</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">4. Payment and Billing</h2>
            <p className="text-muted-foreground">
              Subscription fees are billed in advance on a monthly or annual basis. All payments
              are non-refundable except as otherwise stated. Please review the terms carefully
              before subscribing.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">5. User Content</h2>
            <p className="text-muted-foreground">
              You retain ownership of content you create and publish through the platform.
              By using our services, you grant us a license to store and process your content
              solely for the purpose of providing the service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">6. Prohibited Uses</h2>
            <p className="text-muted-foreground">You may not use the platform to:</p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Post illegal, defamatory, or harmful content</li>
              <li>Violate the terms of service of any social media platform</li>
              <li>Attempt to gain unauthorized access to other users&apos; accounts</li>
              <li>Use the service for any fraudulent or deceptive purposes</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">7. Termination</h2>
            <p className="text-muted-foreground">
              You may cancel your subscription at any time. Upon termination, you will lose
              access to paid features. We may terminate or suspend accounts for violations
              of these terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">8. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              Sahabat Kreator is provided &quot;as is&quot; without warranties of any kind.
              We are not liable for any indirect, incidental, or consequential damages arising
              from your use of the platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">9. Governing Law</h2>
            <p className="text-muted-foreground">
              These terms are governed by the laws of the Republic of Indonesia. Any disputes
              shall be resolved through mutual agreement or applicable legal proceedings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">10. Changes to Terms</h2>
            <p className="text-muted-foreground">
              We may update these terms from time to time. Material changes will be communicated
              via email or in-platform notification at least 30 days before they take effect.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">11. Contact</h2>
            <p className="text-muted-foreground">
              For questions about these terms, please contact us at support@sahabatkreator.com
            </p>
            <p className="mt-2 text-sm">
              For information about data deletion and privacy rights, see our{" "}
              <Link href="/en/kebijakan-privasi" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/en/penghapusan-data" className="text-primary hover:underline">
                Data Deletion Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
