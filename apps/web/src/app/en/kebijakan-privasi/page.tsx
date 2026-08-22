import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Sahabat Kreator",
  description: "Privacy policy and personal data protection for Sahabat Kreator users",
  alternates: {
    canonical: "https://sahabatkreator.com/en/kebijakan-privasi",
    languages: {
      "id-ID": "https://sahabatkreator.com/kebijakan-privasi",
      "en-US": "https://sahabatkreator.com/en/kebijakan-privasi",
    },
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPageEN() {
  return (
    <>
      <main className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
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
            <h2 className="text-xl font-semibold">1. Information We Collect</h2>
            <p className="text-muted-foreground">
              We collect information you provide directly, including:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Identity (name, email, phone number)</li>
              <li>Account information and preferences</li>
              <li>Content you upload and manage</li>
              <li>Platform usage data</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
            <p className="text-muted-foreground">Your information is used to:</p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Provide and improve our services</li>
              <li>Manage your account and communicate with you</li>
              <li>Analyze platform usage</li>
              <li>Send important notifications and updates</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">3. Sharing Information</h2>
            <p className="text-muted-foreground">
              We do not sell or rent your personal information to third parties.
              Information is only shared with:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Third parties necessary for service operation (hosting, payment processors)</li>
              <li>Legal authorities if required by law</li>
              <li>Other parties with your consent</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">4. Data Security</h2>
            <p className="text-muted-foreground">
              We implement appropriate technical and organizational security measures to
              protect your personal data from unauthorized access, loss, or misuse. Social media access tokens are encrypted (AES-256-GCM) and the service supports two-factor authentication (2FA).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">5. Your Rights</h2>
            <p className="text-muted-foreground">You have the right to:</p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Access, correct, or delete your personal data</li>
              <li>Opt out of service subscriptions</li>
              <li>Object to data processing for marketing purposes</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">6. Cookies</h2>
            <p className="text-muted-foreground">
              Our platform uses cookies to enhance user experience, analyze usage, and
              deliver relevant content.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">7. Policy Changes</h2>
            <p className="text-muted-foreground">
              We may update this privacy policy from time to time. Material changes
              will be communicated via email or in-platform notification.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">8. Contact</h2>
            <p className="text-muted-foreground">
              For questions about this privacy policy, please contact us at
              privacy@sahabatkreator.com
            </p>
            <p className="mt-2 text-sm">
              For more information about data deletion rights, see the{" "}
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
