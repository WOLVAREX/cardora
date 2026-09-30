import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CollectionPage from "./pages/Collection";
import PrivacyPage from "@/pages/Privacy";
import AuthPage from "@/pages/Auth";
import VerifyAccountPage from "@/pages/VerifyAccount";

const AdminPage = lazy(() => import("./pages/Admin"));

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Suspense fallback={<div className="auth-loading" role="status">Loading Cardora administration…</div>}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path="/login" component={AuthPage} />
        <Route path="/verify-account" component={VerifyAccountPage} />
        <Route path="/verify-email" component={VerifyAccountPage} />
        <Route path="/c/:slug" component={CollectionPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
