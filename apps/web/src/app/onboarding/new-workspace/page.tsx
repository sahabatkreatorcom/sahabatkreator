import { NewWorkspaceForm } from "@/components/onboarding/new-workspace-form";

export default function NewWorkspacePage() {
    return (
        <div>
            <h1 className="text-xl font-semibold">Buat workspace pertama Anda</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Workspace memisahkan konten, tim, dan analitik per brand atau klien.
                Anda bisa menambah workspace lain kapan saja.
            </p>
            <div className="mt-6">
                <NewWorkspaceForm />
            </div>
        </div>
    );
}