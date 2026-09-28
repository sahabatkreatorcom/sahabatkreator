// Step 1 onboarding — sambutan & value props Sahabat Kreator
import { BarChart3, CalendarClock, Sparkles } from "lucide-react";
import { Logo } from "@/components/ui/logo";

const VALUE_PROPS = [
  {
    icon: CalendarClock,
    title: "Jadwal otomatis",
    description: "Posting konsisten tanpa ingat manual",
  },
  {
    icon: Sparkles,
    title: "AI caption",
    description: "Konten menarik dalam hitungan detik",
  },
  {
    icon: BarChart3,
    title: "Analitik lengkap",
    description: "Tahu apa yang works untuk usaha Anda",
  },
];

export function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center">
      <Logo size={72} />
      <h1 className="mt-6 font-bold text-3xl">Selamat datang di Sahabat Kreator</h1>
      <p className="mt-3 max-w-md text-[var(--text-secondary)]">
        Satu tempat untuk menjadwalkan, membuat, dan memantau konten social media usaha Anda.
      </p>

      <div className="mt-10 grid w-full gap-4 text-left sm:grid-cols-3">
        {VALUE_PROPS.map((prop) => (
          <div key={prop.title} className="card card-hover p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
              <prop.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 font-semibold">{prop.title}</p>
            <p className="mt-1 text-[var(--text-secondary)] text-sm">{prop.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
