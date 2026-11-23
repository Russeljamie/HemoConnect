
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Droplet,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound,
  X,
  ClipboardList,
  ShieldCheck,
  Building2,
  Users,
} from "lucide-react";

import {
  adminAPI,
  donorAPI,
  getCurrentUser,
  getDashboardPath,
  hospitalAPI,
  knbtsAPI,
  logout,
  notificationsAPI,
} from "./services/api";
import AdminUsers from "./pages/admin/Users";
import AdminHospitals from "./pages/admin/Hospitals";
import AdminInventory from "./pages/admin/Inventory";
import {
  HospitalAppointmentsPage,
  HospitalInventoryPage,
  HospitalRequestsPage,
  HospitalStaffPage,
} from "./pages/HospitalPages";
import NotificationsPage from "./pages/NotificationsPage";
import {
  DonorProfilePage,
  DonorDonationsPage,
  DonorAppointmentsPage,
  DonorAlertsPage,
} from "./pages/DonorPages";
import "./App.css";
import "./donor-shell.css";

const roleConfig = {
  DONOR: {
    title: "Donor Dashboard",
    subtitle: "Your generosity saves lives.",
    welcome: "Welcome back",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "My Profile", icon: UserRound },
      { label: "Donation History", icon: Droplet },
      { label: "Appointments", icon: CalendarDays },
      { label: "Emergency Alerts", icon: HeartPulse },
    ],
    stats: [
      { label: "Total Donations", value: "—", accent: "blue", icon: Droplet },
      { label: "Next Appointment", value: "—", accent: "green", icon: CalendarDays },
    ],
    primaryTitle: "Recent Donations",
    primarySubtitle: "Your latest donation activity",
    primaryAction: "Donation History",
    primaryType: "table",
    primaryItems: [],
    secondaryTitle: "Emergency Alerts",
    secondarySubtitle: "Donors needed near you",
    secondaryAction: "Emergency Alerts",
    secondaryItems: [],
    secondaryCta: "View All Emergency Alerts",
    ctaLabel: "Book Next Appointment",
    ctaAction: "Appointments",
    bloodBadge: "O+",
  },
  HOSPITAL_STAFF: {
    title: "Hospital Dashboard",
    subtitle: "Inventory and donor coordination.",
    welcome: "Welcome",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Inventory", icon: Droplet },
      { label: "Requests", icon: ClipboardList },
      { label: "Appointments", icon: CalendarDays },
      { label: "Staff", icon: Users },
    ],
    stats: [
      { label: "Units Available", value: "188", accent: "blue", icon: Droplet },
      { label: "Low Stock", value: "4", accent: "gold", icon: HeartPulse },
      { label: "Scheduled Donation", value: "12", accent: "green", icon: CalendarDays },
      { label: "Pending Requests", value: "7", accent: "purple", icon: ClipboardList },
    ],
    primaryTitle: "Inventory Overview",
    primarySubtitle: "Current blood stock by type",
    primaryAction: "Inventory",
    primaryType: "list",
    primaryItems: [
      { title: "O+", meta: "Units available", sub: "58 units", status: "Stable" },
      { title: "A+", meta: "Units available", sub: "31 units", status: "Low" },
      { title: "O-", meta: "Units available", sub: "24 units", status: "Critical" },
    ],
    secondaryTitle: "Incoming Requests",
    secondarySubtitle: "Priority needs",
    secondaryAction: "Requests",
    secondaryItems: [
      { title: "Emergency O+ request", meta: "Kenya National Hospital", sub: "2 units • urgent", action: "Review" },
      { title: "A+ transfer request", meta: "Mama Lucy Hospital", sub: "1 unit • routine", action: "Review" },
    ],
    secondaryCta: "Manage Requests",
    ctaLabel: "Open Inventory",
    ctaAction: "Inventory",
    bloodBadge: "Inventory",
  },
  KNBTS_STAFF: {
    title: "KNBTS Centre",
    subtitle: "Blood collection centre account.",
    welcome: "Welcome",
    nav: [{ label: "Dashboard", icon: LayoutDashboard }],
    stats: [],
  },
  ADMIN: {
    title: "Admin Dashboard",
    subtitle: "Platform oversight and controls.",
    welcome: "Welcome",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Users", icon: Users },
      { label: "Institutions", icon: Building2 },
      { label: "Inventory", icon: Droplet },
      { label: "Reports", icon: ClipboardList },
    ],
    stats: [
      { label: "Active Users", value: "—", accent: "blue", icon: Users },
      { label: "Hospitals", value: "—", accent: "gold", icon: Building2 },
      { label: "Inventory Alerts", value: "—", accent: "green", icon: Droplet },
      { label: "Open Issues", value: "—", accent: "purple", icon: ShieldCheck },
    ],
    primaryTitle: "System Overview",
    primarySubtitle: "Platform health and activity",
    primaryAction: "Reports",
    primaryType: "list",
    primaryItems: [],
    secondaryTitle: "Platform Alerts",
    secondarySubtitle: "Operational monitoring",
    secondaryAction: "Reports",
    secondaryItems: [],
    secondaryCta: "View System Reports",
    ctaLabel: "Open Reports",
    ctaAction: "Reports",
    bloodBadge: "Admin",
  },
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [donorProfile, setDonorProfile] = useState(null);
  const [donorAlerts, setDonorAlerts] = useState([]);
  const [donorDashboardLoading, setDonorDashboardLoading] = useState(true);
  const [donorDashboardError, setDonorDashboardError] = useState("");
  const [donorDashboardRefresh, setDonorDashboardRefresh] = useState(0);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [hospitalProfile, setHospitalProfile] = useState(null);
  const [knbtsProfile, setKnbtsProfile] = useState(null);
  const [knbtsProfileLoading, setKnbtsProfileLoading] = useState(false);
  const [adminDashboard, setAdminDashboard] = useState(null);

  const user = getCurrentUser() || {};
  const firstName = user.firstName || "Donor";
  const lastName = user.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const role = user.role || "DONOR";
  const isAdminUsersPage = role === "ADMIN" && location.pathname === "/admin/users";
  const isAdminHospitalsPage = role === "ADMIN" && location.pathname === "/admin/hospitals";
  const isAdminInventoryPage = role === "ADMIN" && location.pathname === "/admin/inventory";
  const isHospitalInventoryPage = role === "HOSPITAL_STAFF" && location.pathname === "/hospital/inventory";
  const isHospitalRequestsPage = role === "HOSPITAL_STAFF" && location.pathname === "/hospital/requests";
  const isHospitalAppointmentsPage = role === "HOSPITAL_STAFF" && location.pathname === "/hospital/appointments";
  const isHospitalStaffPage = role === "HOSPITAL_STAFF" && location.pathname === "/hospital/staff";
  const isNotificationPage = location.pathname === "/notifications";
  const donorPage = {
    "/donor/profile": { label: "My Profile", subtitle: "Manage your donor details." },
    "/donor/donations": { label: "Donation History", subtitle: "Review your recorded donations." },
    "/donor/appointments": { label: "Appointments", subtitle: "Manage your donation visits." },
    "/donor/alerts": { label: "Emergency Alerts", subtitle: "Find requests that match your blood type." },
  }[location.pathname];
  const currentRole = roleConfig[role] || roleConfig.DONOR;
  const roleDisplay = role
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  useEffect(() => {
    if (role === "DONOR") {
      let cancelled = false;
      setDonorDashboardLoading(true);
      setDonorDashboardError("");
      setMessage("");

      const reportError = (section, error) => {
        const detail = error.response?.data?.message || error.message;
        return `${section}${detail ? `: ${detail}` : " could not be loaded."}`;
      };

      Promise.all([
        donorAPI.getProfile()
          .then((response) => {
            if (cancelled) return;
            setDonorProfile(response?.data || null);
          })
          .catch((error) => reportError("Profile", error)),
        donorAPI.getAlerts()
          .then((response) => {
            if (!cancelled) setDonorAlerts(response?.data?.alerts || []);
          })
          .catch((error) => reportError("Emergency alerts", error)),
      ]).then((errors) => {
        if (!cancelled) setDonorDashboardError(errors.filter(Boolean).join(" "));
      }).finally(() => {
        if (!cancelled) setDonorDashboardLoading(false);
      });

      return () => { cancelled = true; };
    }

    if (role === "HOSPITAL_STAFF") {
      hospitalAPI
        .getProfile()
        .then((response) => {
          setHospitalProfile(response?.data || null);
          setDonorProfile(null);
        })
        .catch(() => {
          setMessage("Unable to load hospital staff details. Please try again later.");
        });
      return;
    }

    if (role === "KNBTS_STAFF") {
      let cancelled = false;
      setKnbtsProfileLoading(true);
      knbtsAPI.getProfile()
        .then((response) => {
          if (!cancelled) setKnbtsProfile(response?.data?.staff || null);
        })
        .catch((error) => {
          if (!cancelled) {
            setMessage(error.response?.data?.message || "Unable to load KNBTS centre details.");
          }
        })
        .finally(() => {
          if (!cancelled) setKnbtsProfileLoading(false);
        });
      return () => { cancelled = true; };
    }

    if (role === "ADMIN") {
      adminAPI
        .getDashboardSummary()
        .then((response) => {
          setAdminDashboard(response?.data || null);
        })
        .catch(() => {
          setMessage("Unable to load admin dashboard data. Please try again later.");
        });
    }
  }, [role, donorDashboardRefresh]);

  useEffect(() => {
    let cancelled = false;
    notificationsAPI.getNotifications()
      .then((response) => {
        if (cancelled) return;
        const notifications = response.data.notifications || [];
        setGlobalNotifications(notifications);
        setUnreadNotificationCount(response.data.unreadCount ?? notifications.filter((item) => !item.readAt).length);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error.response?.data?.message || "Unable to load your notifications.");
        }
      });
    return () => { cancelled = true; };
  }, [role, location.pathname]);

  const donorStats = donorProfile
    ? [
        {
          label: "Total Donations",
          value: String(donorProfile.metrics?.totalDonations ?? 0),
          accent: "blue",
          icon: Droplet,
        },
        {
          label: "Next Appointment",
          value: donorProfile.metrics?.nextAppointment || "Not Scheduled",
          accent: "green",
          icon: CalendarDays,
        },
      ]
    : currentRole.stats;

  const donorPrimaryItems = donorProfile
    ? donorProfile.donationHistory.map((item) => ({
        date: item.date,
        bloodType: item.bloodType,
        quantity: item.quantity,
        status: item.status,
      }))
    : currentRole.primaryItems;


  const hospitalStats = hospitalProfile
    ? [
        {
          label: "Units Available",
          value: String(hospitalProfile.metrics?.unitsAvailable ?? 0),
          accent: "blue",
          icon: Droplet,
        },
        {
          label: "Low Stock",
          value: String(hospitalProfile.metrics?.lowStock ?? 0),
          accent: "gold",
          icon: HeartPulse,
        },
        {
          label: "Scheduled Donation",
          value: String(hospitalProfile.metrics?.scheduledDonations ?? 0),
          accent: "green",
          icon: CalendarDays,
        },
        {
          label: "Pending Requests",
          value: String(hospitalProfile.metrics?.pendingRequests ?? 0),
          accent: "purple",
          icon: ClipboardList,
        },
      ]
    : currentRole.stats;

  const hospitalPrimaryItems = hospitalProfile
    ? (hospitalProfile.inventorySummary || []).map((item) => ({
        title: item.bloodType,
        meta: "Units available",
        sub: `${item.units} units`,
        status: item.status,
      }))
    : currentRole.primaryItems;

  const adminStats = adminDashboard
    ? [
        {
          label: "Active Users",
          value: String(adminDashboard.metrics?.activeUsers ?? 0),
          accent: "blue",
          icon: Users,
        },
        {
          label: "Hospitals",
          value: String(adminDashboard.metrics?.hospitals ?? 0),
          accent: "gold",
          icon: Building2,
        },
        {
          label: "Inventory Alerts",
          value: String(adminDashboard.metrics?.inventoryAlerts ?? 0),
          accent: "green",
          icon: Droplet,
        },
        {
          label: "Open Issues",
          value: String(adminDashboard.metrics?.openIssues ?? 0),
          accent: "purple",
          icon: ShieldCheck,
        },
      ]
    : currentRole.stats;

  const effectiveRole = role === "DONOR" && donorProfile
    ? {
        ...currentRole,
        stats: donorStats,
        primaryItems: donorPrimaryItems,
        secondaryItems: donorAlerts.slice(0, 3).map((alert) => ({
          title: `${alert.bloodType} Blood Needed`,
          meta: alert.hospital?.name || "Hospital not assigned",
          sub: `${alert.quantityRequired} units · ${alert.urgencyLevel}`,
          action: "View",
        })),
        bloodBadge: donorProfile.user?.bloodType || currentRole.bloodBadge,
      }
    : role === "HOSPITAL_STAFF" && hospitalProfile
        ? {
            ...currentRole,
            stats: hospitalStats,
            primaryItems: hospitalPrimaryItems,
            bloodBadge: hospitalProfile.user?.hospitalName || currentRole.bloodBadge,
          }
        : role === "ADMIN"
            ? {
                ...currentRole,
                stats: adminStats,
                primaryItems: adminDashboard?.overview || [],
                secondaryItems: adminDashboard?.alerts || [],
              }
            : currentRole;

  const navigation = effectiveRole.nav;
  const hospitalPageLabel = isHospitalInventoryPage
    ? "Inventory"
    : isHospitalRequestsPage
      ? "Requests"
      : isHospitalAppointmentsPage
        ? "Appointments"
        : isHospitalStaffPage ? "Staff" : null;
  const activeNavigationLabel = donorPage?.label || hospitalPageLabel || (isAdminUsersPage
    ? "Users"
    : isAdminHospitalsPage
      ? "Institutions"
    : isAdminInventoryPage ? "Inventory" : "Dashboard");

  function handleLogout() {
    logout();
    setMessage("");
    setSidebarOpen(false);
    navigate("/login", { replace: true });
  }

  function handleRegister() {
    logout();
    setMessage("");
    setSidebarOpen(false);
    navigate("/register", { replace: true });
  }

  function handleNavigation(label) {
    setSidebarOpen(false);

    if (role === "DONOR") {
      const donorRoutes = {
        Dashboard: "/dashboard",
        "My Profile": "/donor/profile",
        "Donation History": "/donor/donations",
        Appointments: "/donor/appointments",
        "Emergency Alerts": "/donor/alerts",
      };

      if (donorRoutes[label]) {
        setMessage("");
        navigate(donorRoutes[label]);
        return;
      }
    }

    if (role === "HOSPITAL_STAFF" && ["Inventory", "Requests"].includes(label)) {
      setMessage("");
      const hospitalRoutes = { Inventory: "/hospital/inventory", Requests: "/hospital/requests" };
      navigate(hospitalRoutes[label]);
      return;
    }

    if (role === "HOSPITAL_STAFF" && ["Appointments", "Staff"].includes(label)) {
      setMessage("");
      navigate(label === "Appointments" ? "/hospital/appointments" : "/hospital/staff");
      return;
    }

    if (role === "ADMIN" && label === "Users") {
      setMessage("");
      navigate("/admin/users");
      return;
    }

    if (role === "ADMIN" && label === "Institutions") {
      setMessage("");
      navigate("/admin/hospitals");
      return;
    }

    if (role === "ADMIN" && label === "Inventory") {
      setMessage("");
      navigate("/admin/inventory");
      return;
    }

    if (label === "Dashboard") {
      setMessage("");
      navigate(getDashboardPath(role));
      return;
    }

    setMessage(`${label} is not available yet. We will implement it in a later phase.`);
  }

  function handleDonorProfileUpdated(updatedUser) {
    const currentUser = getCurrentUser() || {};
    localStorage.setItem(
      "hemoconnect_user",
      JSON.stringify({ ...currentUser, ...updatedUser })
    );
    setDonorProfile((current) => current
      ? { ...current, user: { ...current.user, ...updatedUser } }
      : current);
  }

  function refreshHospitalProfile() {
    hospitalAPI.getProfile()
      .then((response) => setHospitalProfile(response?.data || null))
      .catch(() => setMessage("Unable to refresh your hospital dashboard."));
  }

  const donorPageContent = {
    "/donor/profile": <DonorProfilePage onProfileUpdated={handleDonorProfileUpdated} />,
    "/donor/donations": <DonorDonationsPage />,
    "/donor/appointments": <DonorAppointmentsPage />,
    "/donor/alerts": <DonorAlertsPage />,
  }[location.pathname];
  const hospitalPageContent = isHospitalInventoryPage
    ? <HospitalInventoryPage onInventoryUpdated={refreshHospitalProfile} />
    : isHospitalRequestsPage
      ? <HospitalRequestsPage onRequestUpdated={refreshHospitalProfile} />
      : isHospitalAppointmentsPage
        ? <HospitalAppointmentsPage onAppointmentUpdated={refreshHospitalProfile} />
        : isHospitalStaffPage ? <HospitalStaffPage /> : null;

  const renderStatCard = ({ label, value, accent, icon: Icon }, index) => (
    <div className="stat-card" key={`${label}-${index}`}>
      <div className={`stat-icon ${accent}`}>
        <Icon size={22} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );

  const renderPrimaryItems = () => {
    if (effectiveRole.primaryType === "table") {
      return (
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
                {effectiveRole.primaryItems.length === 0 ? (
                  <tr><td colSpan="4" className="dashboard-empty-state">No donation records yet.</td></tr>
                ) : effectiveRole.primaryItems.map((item) => (
                <tr key={`${item.date}-${item.bloodType}`}>
                  <td>{item.date}</td>
                  <td>
                    <span className="blood-type">{item.bloodType}</span>
                  </td>
                  <td>{item.quantity}</td>
                  <td>
                    <span className="status completed">{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="role-list">
        {effectiveRole.primaryItems.map((item) => (
          <div className="role-item" key={`${item.title}-${item.meta}`}>
            <div className="alert-icon">
              <Droplet size={20} fill="currentColor" />
            </div>
            <div className="alert-content">
              <strong>{item.title}</strong>
              <span>{item.meta}</span>
              <small>{item.sub}</small>
            </div>
            {item.status && <span className="status-tag">{item.status}</span>}
          </div>
        ))}
      </div>
    );
  };

  const renderSecondaryItems = () => (
    <div className="role-list">
      {effectiveRole.secondaryItems.map((item) => (
        <div className="role-item" key={`${item.title}-${item.meta}`}>
          <div className="alert-icon">
            <Droplet size={20} fill="currentColor" />
          </div>
          <div className="alert-content">
            <strong>{item.title}</strong>
            <span>{item.meta}</span>
            <small>{item.sub}</small>
          </div>
          <button
            type="button"
            className="small-button"
            onClick={() => handleNavigation(effectiveRole.secondaryAction)}
          >
            {item.action}
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <button
            type="button"
            className="brand brand-link"
            onClick={() => handleNavigation("Dashboard")}
            aria-label="HemoConnect dashboard"
          >
            <div className="brand-icon">
              <Droplet size={22} fill="currentColor" />
            </div>
            <div>
              <div className="brand-name">HemoConnect</div>
              <div className="brand-subtitle">Blood Donation System</div>
            </div>
          </button>

          <button
            type="button"
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={21} />
          </button>
        </div>

        <nav className="sidebar-navigation">
          <div className="navigation-label">MAIN MENU</div>

          {navigation.map(({ label, icon: Icon }) => (
            <button
              type="button"
              key={label}
              className={`nav-item${label === activeNavigationLabel ? " active" : ""}`}
              onClick={() => handleNavigation(label)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="nav-item"
            onClick={handleRegister}
          >
            <UserRound size={19} />
            <span>Register Another Account</span>
          </button>

          <button
            type="button"
            className="nav-item"
            onClick={handleLogout}
          >
            <LogOut size={19} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={23} />
            </button>

            <div>
              <div className="page-title">
                {isNotificationPage
                  ? "Notifications"
                  : donorPage?.label || (isHospitalInventoryPage
                    ? "Blood Inventory"
                    : isHospitalRequestsPage
                      ? "Hospital Request Coordination"
                      : isHospitalAppointmentsPage
                        ? "Appointments"
                        : isHospitalStaffPage
                          ? "Hospital Staff"
                          : isAdminUsersPage
                            ? "User Accounts"
                            : isAdminHospitalsPage
                              ? "Institution Directory"
                              : isAdminInventoryPage ? "Blood Inventory" : effectiveRole.title)}
              </div>
              <div className="page-subtitle">
                {isNotificationPage
                  ? "Updates and reminders for your HemoConnect account."
                  : donorPage?.subtitle || (isHospitalInventoryPage
                    ? "Review and adjust blood stock at your hospital."
                    : isHospitalRequestsPage
                      ? "Create official requests and record fulfillment."
                      : isHospitalAppointmentsPage
                        ? "Review and update appointments at your hospital."
                        : isHospitalStaffPage
                          ? "Contact your hospital team."
                          : isAdminUsersPage
                            ? "Manage platform account access."
                            : isAdminHospitalsPage
                              ? "Review hospitals and KNBTS centre access."
                              : isAdminInventoryPage ? "Monitor stock levels across the hospital network." : effectiveRole.subtitle)}
              </div>
            </div>
          </div>

          <div className="topbar-right">
            <button
              type="button"
              className="notification-button"
              aria-label="Notifications"
              onClick={() => { setMessage(""); navigate("/notifications"); }}
            >
              <Bell size={21} />
              {unreadNotificationCount > 0 && (
                <span className="notification-dot">{unreadNotificationCount}</span>
              )}
            </button>

            <div className="user-menu">
              <div className="avatar">{initials || "D"}</div>

              <div className="user-details">
                <strong>{fullName}</strong>
                <span>{roleDisplay}</span>
              </div>

              <button
                type="button"
                className="notification-button"
                onClick={() => setAccountMenuOpen((open) => !open)}
                aria-label="Open account menu"
                aria-expanded={accountMenuOpen}
                aria-controls="account-menu"
                title="Account menu"
              >
                <ChevronDown size={17} />
              </button>

              {accountMenuOpen && (
                <div className="account-menu" id="account-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      handleNavigation(role === "DONOR" ? "My Profile" : "Dashboard");
                    }}
                  >
                    <UserRound size={16} />
                    My Profile
                  </button>
                  <button type="button" role="menuitem" onClick={handleRegister}>
                    <Users size={16} />
                    Register Another Account
                  </button>
                  <button type="button" role="menuitem" onClick={handleLogout}>
                    <LogOut size={16} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="dashboard-content">
          {role === "DONOR" && location.pathname === "/dashboard" && donorDashboardError && (
            <div className="dashboard-message" role="alert">
              <span>Some dashboard data could not be loaded. {donorDashboardError}</span>
              <button
                type="button"
                onClick={() => setDonorDashboardRefresh((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          )}
          {message && (
            <div className="dashboard-message" role="status">
              <span>{message}</span>
              <button
                type="button"
                onClick={() => setMessage("")}
                aria-label="Dismiss message"
              >
                ×
              </button>
            </div>
          )}

          {role === "KNBTS_STAFF" ? (
            knbtsProfileLoading ? (
              <div className="donor-page-state" role="status">Loading centre profile...</div>
            ) : (
              <section className="dashboard-card knbts-landing-card" aria-labelledby="knbts-centre-heading">
                <h1 id="knbts-centre-heading">{knbtsProfile?.centre?.name || "KNBTS Centre"}</h1>
                <p className="knbts-landing-designation">{knbtsProfile?.designation || "KNBTS staff"}</p>
                <p>More centre features are coming soon.</p>
                <button type="button" className="primary-button" onClick={handleLogout}>
                  <LogOut size={18} />
                  Logout
                </button>
              </section>
            )
          ) : role === "DONOR" && !donorPage && donorDashboardLoading ? (
            <div className="donor-page-state" role="status">Loading your dashboard...</div>
          ) : role === "DONOR" && donorPage ? (
            donorPageContent
          ) : isNotificationPage ? (
            <NotificationsPage onUnreadCountChange={setUnreadNotificationCount} />
          ) : hospitalPageLabel ? (
            hospitalPageContent
          ) : isAdminUsersPage ? (
            <AdminUsers />
          ) : isAdminHospitalsPage ? (
            <AdminHospitals />
          ) : isAdminInventoryPage ? (
            <AdminInventory />
          ) : (
          <>
          <section className="welcome-section">
            <div>
              <h1>
                {effectiveRole.welcome}, {firstName}!
              </h1>
              <p>Thank you for being part of the HemoConnect community.</p>
            </div>

            <div className="blood-badge">
              <Droplet size={18} fill="currentColor" />
              <span>Profile: {effectiveRole.bloodBadge}</span>
            </div>
          </section>

          <section className="stats-grid">
            {effectiveRole.stats.map(renderStatCard)}
          </section>

          <section className="dashboard-grid">
            <div className="dashboard-card donations-card">
              <div className="card-header">
                <div>
                  <h2>{effectiveRole.primaryTitle}</h2>
                  <p>{effectiveRole.primarySubtitle}</p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => handleNavigation(effectiveRole.primaryAction)}
                >
                  View All
                </button>
              </div>

              {renderPrimaryItems()}

              <div className="card-action">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => handleNavigation(effectiveRole.ctaAction)}
                >
                  <CalendarDays size={18} />
                  {effectiveRole.ctaLabel}
                </button>
              </div>
            </div>

            <div className="dashboard-card emergency-card">
              <div className="card-header">
                <div>
                  <h2>{effectiveRole.secondaryTitle}</h2>
                  <p>{effectiveRole.secondarySubtitle}</p>
                </div>
                <span className="alert-count">{effectiveRole.secondaryItems.length}</span>
              </div>

              {renderSecondaryItems()}

              <button
                type="button"
                className="outline-button"
                onClick={() => handleNavigation(effectiveRole.secondaryAction)}
              >
                {effectiveRole.secondaryCta}
              </button>
            </div>
          </section>
          </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
