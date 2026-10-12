import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">Zoom & YouTube Studio</h1>
          <p className="text-xs text-slate-400 mt-1">Sign in with your team account to continue</p>
        </div>
        <div className="flex justify-center">
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
        </div>
      </div>
    </div>
  );
}
