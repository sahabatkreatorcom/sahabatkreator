import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Film,
  MessageSquare,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Sahabat Kreator | AI-Powered Social Media Management Platform",
  description:
    "Sahabat Kreator is an AI-powered social media management platform for Indonesian creators and businesses: schedule content, monitor analytics, reply to comments, and boost engagement in one dashboard.",
  alternates: {
    canonical: "https://sahabatkreator.com/en",
    languages: {
      "id-ID": "https://sahabatkreator.com",
      "en-US": "https://sahabatkreator.com/en",
    },
  },
  openGraph: {
    title: "Sahabat Kreator | Social Media Management Platform",
    description:
      "Schedule content to Instagram, TikTok, YouTube, Facebook, LinkedIn, and more, monitor analytics, and get AI assistant recommendations in one dashboard.",
    url: "https://sahabatkreator.com/en",
    siteName: "Sahabat Kreator",
    type: "website",
    locale: "en_US",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const heroStats = [
  { value: "12+", label: "Supported Platforms" },
  { value: "8", label: "Publishable Platforms" },
  { value: "1", label: "Unified Dashboard" },
  { value: "AI", label: "Seb Assistant" },
];

const features = [
  {
    icon: CalendarClock,
    title: "Schedule & Multi-Platform Publishing",
    desc: "Create one piece of content and publish it to Instagram, TikTok, Facebook, YouTube, Pinterest, LinkedIn, and Threads. Auto-schedule with our calendar.",
  },
  {
    icon: Film,
    title: "Media Library & Stock",
    desc: "Manage media on Cloudflare R2, batch upload, and search stock from Pixabay, Pexels, and Unsplash without leaving the dashboard.",
  },
  {
    icon: MessageSquare,
    title: "Unified Comment Inbox",
    desc: "Collect and reply to comments from multiple accounts in one inbox, plus auto-reply based on keywords.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    desc: "Monitor followers, impressions, and reach per platform. See trends and compare your content performance.",
  },
  {
    icon: TrendingUp,
    title: "Competitor & Social Listening",
    desc: "Track competitor follower growth and engagement, monitor keyword sentiment, and discover content opportunities.",
  },
  {
    icon: Sparkles,
    title: "Seb AI Assistant",
    desc: "Monthly strategy reports, content recommendations, consultation chat, brand website scanning, and visual media analysis.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    desc: "Invite members, set OWNER/ADMIN/MEMBER/VIEWER roles, and manage content approval together with your team.",
  },
  {
    icon: Zap,
    title: "Content Tools",
    desc: "Content pillars, caption templates, and hashtag collections to accelerate consistent content production.",
  },
];

const steps = [
  {
    number: "01",
    title: "Connect Accounts",
    desc: "Login to platforms, connect your Instagram, TikTok, Facebook, YouTube, and more accounts via one-click OAuth.",
  },
  {
    number: "02",
    title: "Create & Schedule",
    desc: "Compose content with media from the library or stock, select target accounts, and schedule on the calendar.",
  },
  {
    number: "03",
    title: "Monitor & Optimize",
    desc: "Reply to comments from your inbox, monitor analytics, and let Seb provide the next strategy recommendations.",
  },
];

const testimonials = [
  {
    quote:
      "Now I can manage 6 client accounts from one dashboard. The Seb AI feature makes monthly reports super fast.",
    author: "Rina Wahyuni",
    role: "Social Media Manager, Jakarta",
  },
  {
    quote:
      "The unified comment inbox saved our team. Replying to IG and TikTok comments without switching apps.",
    author: "Andi Firmansyah",
    role: "Agency Owner, Surabaya",
  },
  {
    quote:
      "Multi-platform scheduling + media library makes our content workflow much neater. Recommended for serious creators.",
    author: "Sinta Dewi",
    role: "Content Creator, Bandung",
  },
];

export default function EnglishLandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="container mx-auto px-4 py-20 text-center md:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              AI-Powered Social Media Management Platform
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              Sahabat Kreator: Manage All Social Media Accounts in{" "}
              <span className="text-primary">One Dashboard</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
              Social media management platform for Indonesian creators. Schedule content,
              reply to comments, monitor analytics, and get recommendations from AI assistant —
              for Instagram, TikTok, YouTube, Facebook, LinkedIn, and more.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/register">
                <Button size="md" className="h-12 px-8 text-base">
                  Start Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/en/fitur">
                <Button variant="secondary" size="md" className="h-12 px-8 text-base">
                  See Features
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No credit card required · Cancel anytime
            </p>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-6 md:grid-cols-4">
            {heroStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-primary">{stat.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="fitur" className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Everything You Need
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Complete features to manage your social media content efficiently
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <feature.icon className="mb-4 h-8 w-8 text-primary" />
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link href="/en/fitur">
              <Button variant="secondary">
                See All Features
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Get Started in 3 Steps
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              No installation needed. Start producing immediately.
            </p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="relative rounded-lg border border-border bg-card p-6">
                <div className="text-sm font-bold text-primary">{step.number}</div>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Trusted by Indonesian Creators & Businesses
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <div key={testimonial.author} className="rounded-lg border border-border bg-card p-6">
                <div className="mb-4 flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">"{testimonial.quote}"</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {testimonial.author[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{testimonial.author}</div>
                    <div className="text-xs text-muted-foreground">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Start Free, Upgrade Anytime
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            The Free plan already lets you connect 3 accounts and schedule content. See all plan options to match your needs.
          </p>
          <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["Free", "Pro", "Business", "Enterprise"].map((plan) => (
              <li key={plan} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {plan}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Link href="/en/harga">
              <Button size="md" className="h-12 px-8 text-base">
                See Pricing
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Ready to Boost Your Content Productivity?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
            Join creators and teams who already manage their social media more neatly with Sahabat Kreator.
          </p>
          <div className="mt-8">
            <Link href="/register">
              <Button
                variant="secondary"
                size="md"
                className="h-12 bg-white px-8 text-base text-primary hover:bg-white/90"
              >
                Try Free Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
