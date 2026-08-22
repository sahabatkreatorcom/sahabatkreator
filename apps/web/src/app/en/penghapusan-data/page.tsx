import type { Metadata } from "next";
import { Shield, Trash2, Clock, AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "Data Deletion | Sahabat Kreator",
  description: "Policy for deleting personal data from the Sahabat Kreator platform",
  alternates: {
    canonical: "https://sahabatkreator.com/en/penghapusan-data",
    languages: {
      "id-ID": "https://sahabatkreator.com/penghapusan-data",
      "en-US": "https://sahabatkreator.com/en/penghapusan-data",
    },
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function DataDeletionPageEN() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-4xl px-4 py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
            <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data Deletion</h1>
            <p className="text-sm text-muted-foreground">Personal data deletion policy</p>
          </div>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <div className="prose prose-lg dark:prose-invert max-w-none">
          {/* Introduction */}
          <section className="mb-8 rounded-lg border border-border bg-muted/30 p-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-muted-foreground">
                  Sahabat Kreator is committed to protecting your personal data. This policy explains how we manage data deletion in compliance with applicable data protection regulations.
                </p>
              </div>
            </div>
          </section>

          {/* 1. Jenis Data */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-primary" />
              1. Types of Data That Can Be Deleted
            </h2>
            <p className="text-muted-foreground">
              You can request deletion of the following types of data:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li><strong>Identity Data</strong> — name, email address, phone number</li>
              <li><strong>Account Data</strong> — preferences, profile settings</li>
              <li><strong>User Content</strong> — drafts, templates, and saved content</li>
              <li><strong>Analytics Data</strong> — platform usage history</li>
              <li><strong>Communication Data</strong> — messages, notifications, and support logs</li>
            </ul>
          </section>

          {/* 2. Hak Penghapusan */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">2. Your Deletion Rights</h2>
            <p className="text-muted-foreground">
              You have the right to request deletion of your personal data at any time. This right is also known as the &quot;right to be forgotten.&quot;
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Partial Deletion</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can request deletion of specific data without deleting your entire account.
                </p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Full Deletion</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can request permanent deletion of all personal data and closure of your account.
                </p>
              </div>
            </div>
          </section>

          {/* 3. Cara Meminta */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">3. How to Request Data Deletion</h2>
            <p className="text-muted-foreground">
              You can request data deletion through several channels:
            </p>
            <ol className="list-decimal space-y-2 pl-6 text-muted-foreground">
              <li><strong>Account Settings Panel</strong> — Go to <code>Settings → Account → Delete Data</code></li>
              <li><strong>Email</strong> — Send a request to <a href="mailto:privacy@sahabatkreator.com" className="text-primary hover:underline">privacy@sahabatkreator.com</a></li>
              <li><strong>Live Chat</strong> — Contact our support team via chat on the platform</li>
              <li><strong>Online Form</strong> — Fill out the data deletion form on the support page</li>
            </ol>
          </section>

          {/* 4. Proses Penghapusan */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              4. Deletion Process and Timeline
            </h2>
            <p className="text-muted-foreground">
              After receiving your deletion request, we will:
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-border p-4">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">1</span>
                <div>
                  <p className="font-medium">Identity Verification (1-2 business days)</p>
                  <p className="text-sm text-muted-foreground">We will verify your identity for security purposes.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border p-4">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">2</span>
                <div>
                  <p className="font-medium">Deletion Process (7-30 business days)</p>
                  <p className="text-sm text-muted-foreground">Data will be deleted from active systems and backup systems.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border p-4">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">3</span>
                <div>
                  <p className="font-medium">Deletion Confirmation</p>
                  <p className="text-sm text-muted-foreground">You will receive a confirmation email after deletion is complete.</p>
                </div>
              </div>
            </div>
          </section>

          {/* 5. Data yang Tidak Dihapus */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              5. Data That Cannot Be Deleted
            </h2>
            <p className="text-muted-foreground">
              Some data may not be fully deletable due to legal or operational requirements:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li><strong>Transaction Data</strong> — Payment records that must be retained per tax regulations (up to 5 years)</li>
              <li><strong>Security Data</strong> — Security logs and audit trails for abuse investigation</li>
              <li><strong>Legal Data</strong> — Information required for dispute resolution or legal compliance</li>
              <li><strong>Anonymized Data</strong> — Data that has been anonymized and cannot be re-identified</li>
            </ul>
          </section>

          {/* 6. Dampak Penghapusan */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">6. Impact of Data Deletion</h2>
            <p className="text-muted-foreground">
              Please note that data deletion will result in:
            </p>
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20 p-4">
              <ul className="list-disc space-y-1 pl-6 text-sm text-red-700 dark:text-red-300">
                <li>Your account will be disabled and cannot be recovered</li>
                <li>All content, drafts, and templates will be permanently deleted</li>
                <li>Usage history and analytics will be lost</li>
                <li>Access to paid features will end</li>
              </ul>
            </div>
          </section>

          {/* 7. Retensi Data */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">7. Data Retention Policy</h2>
            <p className="text-muted-foreground">
              We retain data according to operational needs and legal obligations:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left">Data Type</th>
                    <th className="px-4 py-2 text-left">Retention Period</th>
                    <th className="px-4 py-2 text-left">Legal Basis</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2">Account Data</td>
                    <td className="px-4 py-2">As per user request</td>
                    <td className="px-4 py-2">User consent</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2">Transaction Data</td>
                    <td className="px-4 py-2">5 years</td>
                    <td className="px-4 py-2">Tax obligations</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2">Security Logs</td>
                    <td className="px-4 py-2">2 years</td>
                    <td className="px-4 py-2">System security</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">Analytics Data</td>
                    <td className="px-4 py-2">12 months</td>
                    <td className="px-4 py-2">Service improvement</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 8. Hak Hukum */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">8. Legal Rights</h2>
            <p className="text-muted-foreground">
              In addition to deletion rights, you also have the following rights under data protection regulations:
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Right of Access</h3>
                <p className="mt-1 text-sm text-muted-foreground">Request a copy of your personal data we hold</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Right to Rectification</h3>
                <p className="mt-1 text-sm text-muted-foreground">Correct inaccurate data</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Right to Portability</h3>
                <p className="mt-1 text-sm text-muted-foreground">Receive data in a transferable format</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Right to Object</h3>
                <p className="mt-1 text-sm text-muted-foreground">Object to data processing for specific purposes</p>
              </div>
            </div>
          </section>

          {/* 9. Kontak */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">9. Data Protection Contact</h2>
            <p className="text-muted-foreground">
              If you have questions about data deletion or wish to submit a request, please contact our Data Protection Officer:
            </p>
            <div className="mt-4 space-y-2">
              <p className="text-muted-foreground">📧 Email: <a href="mailto:privacy@sahabatkreator.com" className="text-primary hover:underline">privacy@sahabatkreator.com</a></p>
              <p className="text-muted-foreground">📞 Phone: +62 812-3456-7890</p>
              <p className="text-muted-foreground">📍 Address: Jl. Sudirman No. 123, Jakarta, Indonesia</p>
            </div>
          </section>

          {/* 10. Perubahan Kebijakan */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">10. Policy Changes</h2>
            <p className="text-muted-foreground">
              We may update this data deletion policy from time to time. Material changes will be communicated
              via email or in-platform notification at least 30 days before they take effect.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
