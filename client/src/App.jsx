import { useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Droplet,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Megaphone,
  UserRound,
  X,
} from "lucide-react";

import "./App.css";

const recentDonations = [
  {
    date: "12 Mar 2026",
    bloodType: "O+",
    quantity: "450 ml",
    status: "Completed",
  },
  {
    date: "18 Nov 2025",
    bloodType: "A+",
    quantity: "450 ml",
    status: "Completed",
  },
  {
    date: "15 Aug 2025",
    bloodType: "B+",
    quantity: "450 ml",
    status: "Completed",
  },
  {
    date: "20 May 2025",
    bloodType: "O+",
    quantity: "450 ml",
    status: "Completed",
  },
];

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      active: true,
    },
    {
      label: "My Profile",
      icon: UserRound,
    },
    {
      label: "Donation History",
      icon: Droplet,
    },
    {
      label: "Appointments",
      icon: CalendarDays,
    },
    {
      label: "Emergency Alerts",
      icon: HeartPulse,
    },
    {
      label: "Campaigns",
      icon: Megaphone,
    },
  ];

  return (
    <div className="app-shell">

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={
          "sidebar" + (sidebarOpen ? " sidebar-open" : "")
        }
      >
        <div className="sidebar-header">

          <div className="brand">
            <div className="brand-icon">
              <Droplet size={22} fill="currentColor" />
            </div>

            <div>
              <div className="brand-name">
                HemoConnect
              </div>

              <div className="brand-subtitle">
                Blood Donation System
              </div>
            </div>
          </div>

          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={21} />
          </button>

        </div>

        <nav className="sidebar-navigation">

          <div className="navigation-label">
            MAIN MENU
          </div>

          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className={
                  "nav-item" +
                  (item.active ? " active" : "")
                }
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}

        </nav>

        <div className="sidebar-bottom">

          <button className="nav-item">
            <LogOut size={19} />
            <span>Logout</span>
          </button>

        </div>
      </aside>

      <main className="main-area">

        <header className="topbar">

          <div className="topbar-left">

            <button
              className="mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={23} />
            </button>

            <div>
              <div className="page-title">
                Donor Dashboard
              </div>

              <div className="page-subtitle">
                Your generosity saves lives.
              </div>
            </div>

          </div>

          <div className="topbar-right">

            <button
              className="notification-button"
              aria-label="Notifications"
            >
              <Bell size={21} />
              <span className="notification-dot">
                3
              </span>
            </button>

            <div className="user-menu">

              <div className="avatar">
                JD
              </div>

              <div className="user-details">
                <strong>
                  Russel Jamie
                </strong>

                <span>
                  Donor
                </span>
              </div>

              <ChevronDown size={17} />

            </div>

          </div>

        </header>

        <div className="dashboard-content">

          <section className="welcome-section">

            <div>
              <h1>
                Welcome back, Russ!
              </h1>

              <p>
                Thank you for being part of the
                HemoConnect community.
              </p>
            </div>

            <div className="blood-badge">

              <Droplet
                size={18}
                fill="currentColor"
              />

              <span>
                Blood Type: O+
              </span>

            </div>

          </section>

          <section className="stats-grid">

            <div className="stat-card">

              <div className="stat-icon blue">
                <Droplet size={22} />
              </div>

              <div>
                <span>
                  Total Donations
                </span>

                <strong>
                  4
                </strong>
              </div>

            </div>

            <div className="stat-card">

              <div className="stat-icon gold">
                <HeartPulse size={22} />
              </div>

              <div>
                <span>
                  Reward Points
                </span>

                <strong>
                  120
                </strong>
              </div>

            </div>

            <div className="stat-card">

              <div className="stat-icon green">
                <CalendarDays size={22} />
              </div>

              <div>
                <span>
                  Next Appointment
                </span>

                <strong>
                  Not Scheduled
                </strong>
              </div>

            </div>

            <div className="stat-card">

              <div className="stat-icon purple">
                <Megaphone size={22} />
              </div>

              <div>
                <span>
                  Active Campaigns
                </span>

                <strong>
                  2
                </strong>
              </div>

            </div>

          </section>

          <section className="dashboard-grid">

            <div className="dashboard-card donations-card">

              <div className="card-header">

                <div>
                  <h2>
                    Recent Donations
                  </h2>

                  <p>
                    Your latest donation activity
                  </p>
                </div>

                <button className="text-button">
                  View All
                </button>

              </div>

              <div className="table-wrapper">

                <table>

                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Blood Type</th>
                      <th>Quantity</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>

                    {recentDonations.map(
                      (donation) => (
                        <tr
                          key={
                            donation.date +
                            "-" +
                            donation.bloodType
                          }
                        >

                          <td>
                            {donation.date}
                          </td>

                          <td>
                            <span className="blood-type">
                              {donation.bloodType}
                            </span>
                          </td>

                          <td>
                            {donation.quantity}
                          </td>

                          <td>
                            <span className="status completed">
                              {donation.status}
                            </span>
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

              <div className="card-action">

                <button className="primary-button">

                  <CalendarDays size={18} />

                  Book Next Appointment

                </button>

              </div>

            </div>

            <div className="dashboard-card emergency-card">

              <div className="card-header">

                <div>
                  <h2>
                    Emergency Alerts
                  </h2>

                  <p>
                    Donors needed near you
                  </p>
                </div>

                <span className="alert-count">
                  2
                </span>

              </div>

              <div className="emergency-alert">

                <div className="alert-icon">
                  <Droplet
                    size={20}
                    fill="currentColor"
                  />
                </div>

                <div className="alert-content">

                  <strong>
                    O+ Blood Needed
                  </strong>

                  <span>
                    Kenya National Hospital
                  </span>

                  <small>
                    2 units required
                  </small>

                </div>

                <button className="small-button">
                  View
                </button>

              </div>

              <div className="emergency-alert">

                <div className="alert-icon">
                  <Droplet
                    size={20}
                    fill="currentColor"
                  />
                </div>

                <div className="alert-content">

                  <strong>
                    A+ Blood Needed
                  </strong>

                  <span>
                    Mbagathi Hospital
                  </span>

                  <small>
                    1 unit required
                  </small>

                </div>

                <button className="small-button">
                  View
                </button>

              </div>

              <button className="outline-button">
                View All Emergency Alerts
              </button>

            </div>

            <div className="dashboard-card campaigns-card">

              <div className="card-header">

                <div>
                  <h2>
                    Active Campaigns
                  </h2>

                  <p>
                    Support a blood donation drive
                  </p>
                </div>

                <button className="text-button">
                  View All
                </button>

              </div>

              <div className="campaign">

                <div className="campaign-icon">
                  <Droplet size={21} />
                </div>

                <div>

                  <strong>
                    Nairobi Blood Drive
                  </strong>

                  <span>
                    KNH • 20 March 2026
                  </span>

                </div>

                <button className="small-button">
                  View
                </button>

              </div>

              <div className="campaign">

                <div className="campaign-icon">
                  <Droplet size={21} />
                </div>

                <div>

                  <strong>
                    Community Blood Drive
                  </strong>

                  <span>
                    Westlands • 5 April 2026
                  </span>

                </div>

                <button className="small-button">
                  View
                </button>

              </div>

            </div>

            <div className="dashboard-card rewards-card">

              <div className="reward-icon">
                <HeartPulse size={30} />
              </div>

              <div className="reward-content">

                <span>
                  Your Rewards
                </span>

                <strong>
                  120 points
                </strong>

                <p>
                  Keep donating and earn more rewards.
                </p>

              </div>

              <button className="outline-button">
                View Rewards
              </button>

            </div>

          </section>

        </div>

      </main>

    </div>
  );
}

export default App;