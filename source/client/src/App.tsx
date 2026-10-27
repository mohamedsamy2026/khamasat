import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AthleteProvider } from "./lib/athleteApi";
import Layout, { LoginPanel } from "./components/athlete/Layout";
import Home from "./pages/Home";
import Academies from "./pages/Academies";
import Analysis from "./pages/Analysis";
import PlayerProfile from "./pages/PlayerProfile";
import Clubs, { Favorites } from "./pages/Clubs";
import Reports from "./pages/Reports";
import Requests from "./pages/Requests";
import { Training, Notes, Settings } from "./pages/SupportPages";
import NotFound from "./pages/NotFound";
function Router() {
  const [location] = useLocation();
  const pathname = location.split("?")[0];
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login">
        <Layout>
          <LoginPanel />
        </Layout>
      </Route>
      <Route path="/academies">
        <Layout>
          <Academies />
        </Layout>
      </Route>
      <Route path="/analysis">
        <Layout>
          <Analysis />
        </Layout>
      </Route>
      <Route path="/players/:id">
        {params => (
          <Layout>
            <PlayerProfile id={params.id} />
          </Layout>
        )}
      </Route>
      <Route path="/players">
        <Layout>
          <PlayerProfile />
        </Layout>
      </Route>
      <Route path="/clubs">
        <Layout>
          <Clubs />
        </Layout>
      </Route>
      <Route path="/reports">
        <Layout>
          <Reports />
        </Layout>
      </Route>
      <Route path="/requests">
        <Layout>
          <Requests />
        </Layout>
      </Route>
      <Route path="/favorites">
        <Layout>
          <Favorites />
        </Layout>
      </Route>
      <Route path="/training">
        <Layout>
          <Training />
        </Layout>
      </Route>
      <Route path="/notes">
        <Layout>
          <Notes />
        </Layout>
      </Route>
      <Route path="/settings">
        <Layout>
          <Settings />
        </Layout>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <AthleteProvider>
            <Toaster />
            <Router />
          </AthleteProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
