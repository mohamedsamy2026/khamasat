
import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AthleteProvider } from "./lib/athleteApi";

import Layout from "./components/athlete/Layout";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Academies from "./pages/Academies";
import Analysis from "./pages/Analysis";
import Gymnastics from "./pages/Gymnastics";
import PlayerProfile from "./pages/PlayerProfile";
import Clubs, { Favorites } from "./pages/Clubs";
import Reports from "./pages/Reports";
import Requests from "./pages/Requests";
import {
  Training,
  Notes,
  Settings,
} from "./pages/SupportPages";
import NotFound from "./pages/NotFound";

function Router() {
  const [location] = useLocation();

  const pathname = location.split("?")[0];

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  }, [pathname]);

  return (
    <Switch>
      {/* Public pages */}
      <Route path="/" component={Home} />

      {/* Local authentication */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      {/* Academy dashboard */}
      <Route path="/academies">
        <Layout>
          <Academies />
        </Layout>
      </Route>

      {/* Performance analysis */}
      <Route path="/analysis">
        <Layout>
          <Analysis />
        </Layout>
      </Route>

      {/* Gymnastics */}
      <Route path="/gymnastics">
        <Layout>
          <Gymnastics />
        </Layout>
      </Route>

      {/* Player profile with ID */}
      <Route path="/players/:id">
        {params => (
          <Layout>
            <PlayerProfile id={params.id} />
          </Layout>
        )}
      </Route>

      {/* Players */}
      <Route path="/players">
        <Layout>
          <PlayerProfile />
        </Layout>
      </Route>

      {/* Clubs */}
      <Route path="/clubs">
        <Layout>
          <Clubs />
        </Layout>
      </Route>

      {/* Reports */}
      <Route path="/reports">
        <Layout>
          <Reports />
        </Layout>
      </Route>

      {/* Access requests */}
      <Route path="/requests">
        <Layout>
          <Requests />
        </Layout>
      </Route>

      {/* Favorites */}
      <Route path="/favorites">
        <Layout>
          <Favorites />
        </Layout>
      </Route>

      {/* Training */}
      <Route path="/training">
        <Layout>
          <Training />
        </Layout>
      </Route>

      {/* Notes */}
      <Route path="/notes">
        <Layout>
          <Notes />
        </Layout>
      </Route>

      {/* Settings */}
      <Route path="/settings">
        <Layout>
          <Settings />
        </Layout>
      </Route>

      {/* Not found */}
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
