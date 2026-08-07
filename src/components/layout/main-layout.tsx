import Header from "./header";
import Sidebar from "./sidebar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <Sidebar />
      <main className="ml-[200px] mt-[56px] p-6 min-h-[calc(100vh-56px)]">
        {children}
      </main>
    </div>
  );
}
