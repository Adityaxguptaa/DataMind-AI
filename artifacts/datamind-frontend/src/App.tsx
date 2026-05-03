import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Analyst from "@/pages/analyst";
import Documents from "@/pages/documents";
import Chatbot from "@/pages/chatbot";
import Playground from "@/pages/playground";
import CodeReview from "@/pages/code-review";
import Resume from "@/pages/resume";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen w-full flex items-center justify-center font-mono text-primary">Initializing DataMind...</div>;
  if (!user) return <Redirect to="/login" />;
  return (
    <Route {...rest}>
      <DashboardLayout>
        <Component />
      </DashboardLayout>
    </Route>
  );
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen w-full flex items-center justify-center font-mono text-primary">Initializing DataMind...</div>;
  if (user) return <Redirect to="/dashboard" />;
  return <Redirect to="/login" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/analyst" component={Analyst} />
      <ProtectedRoute path="/documents" component={Documents} />
      <ProtectedRoute path="/chatbot" component={Chatbot} />
      <ProtectedRoute path="/playground" component={Playground} />
      <ProtectedRoute path="/code-review" component={CodeReview} />
      <ProtectedRoute path="/resume" component={Resume} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
