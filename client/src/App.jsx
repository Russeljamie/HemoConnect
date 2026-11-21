
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
  Megaphone,
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
  hospitalAPI,
  logout,
  ngoAPI,
  notificationsAPI,
  patientAPI,
} from "./services/api";
import AdminUsers from "./pages/admin/Users";
import AdminHospitals from "./pages/admin/Hospitals";
import AdminInventory from "./pages/admin/Inventory";
import {
  HospitalAppointmentsPage,
  HospitalDonationNeedsPage,
  HospitalInventoryPage,
  HospitalRequestsPage,
  HospitalStaffPage,
} from "./pages/HospitalPages";
import { NgoCampaignsPage, NgoNotificationsPage, NgoOutreachPage, NgoReportsPage } from "./pages/NgoPages";
import { PatientRequestsPage } from "./pages/PatientPages";
import { PatientAppointmentsPage, PatientMedicalNotesPage } from "./pages/PatientRecordPages";
import NotificationsPage from "./pages/NotificationsPage";
import {
  DonorProfilePage,
  DonorDonationsPage,
  DonorAppointmentsPage,
  DonorAlertsPage,
  DonorCampaignsPage,
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
      { label: "Campaigns", icon: Megaphone },
    ],
    stats: [
      { label: "Total Donations", value: "—", accent: "blue", icon: Droplet },
      { label: "Next Appointment", value: "—", accent: "green", icon: CalendarDays },
      { label: "Active Campaigns", value: "—", accent: "purple", icon: Megaphone },
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
  PATIENT: {
    title: "Patient Dashboard",
    subtitle: "Track requests and care updates.",
    welcome: "Welcome",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Request Assistance", icon: ClipboardList },
      { label: "Appointments", icon: CalendarDays },
      { label: "Medical Notes", icon: ShieldCheck },
      { label: "Notifications", icon: Bell },
    ],
    stats: [
      { label: "Open Requests", value: "3", accent: "blue", icon: ClipboardList },
      { label: "Urgent Needs", value: "1", accent: "gold", icon: HeartPulse },
      { label: "Upcoming Visits", value: "2", accent: "green", icon: CalendarDays },
      { label: "Notifications", value: "5", accent: "purple", icon: Bell },
    ],
    primaryTitle: "Active Blood Requests",
    primarySubtitle: "Your current need status",
    primaryAction: "My Requests",
    primaryType: "list",
    primaryItems: [
      { title: "A+ Request", meta: "Kenyatta National Hospital", sub: "Urgent • 2 units needed", status: "In progress" },
      { title: "O- Request", meta: "Mbagathi Hospital", sub: "Routine • 1 unit needed", status: "Matched" },
      { title: "B+ Request", meta: "Aga Khan Hospital", sub: "Follow-up • 2 units needed", status: "Pending" },
    ],
    secondaryTitle: "Care Updates",
    secondarySubtitle: "Recent communications",
    secondaryAction: "Notifications",
    secondaryItems: [
      { title: "Donor match identified", meta: "Blood bank team", sub: "Available within 30 minutes", action: "View" },
      { title: "Appointment confirmed", meta: "Care coordinator", sub: "Tuesday 10:30 AM", action: "Open" },
    ],
    secondaryCta: "Open Notifications",
    ctaLabel: "Request Assistance",
    ctaAction: "Request Assistance",
    bloodBadge: "A+",
  },
  HOSPITAL_STAFF: {
    title: "Hospital Dashboard",
    subtitle: "Inventory and donor coordination.",
    welcome: "Welcome",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Inventory", icon: Droplet },
      { label: "Requests", icon: ClipboardList },
      { label: "Donation Needs", icon: HeartPulse },
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
  NGO: {
    title: "NGO Dashboard",
    subtitle: "Campaigns and community outreach.",
    welcome: "Welcome",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Campaigns", icon: Megaphone },
      { label: "Outreach", icon: Users },
      { label: "Reports", icon: ClipboardList },
      { label: "Notifications", icon: Bell },
    ],
    stats: [
      { label: "Campaigns", value: "6", accent: "blue", icon: Megaphone },
      { label: "Volunteers", value: "74", accent: "gold", icon: Users },
      { label: "Blood Drives", value: "3", accent: "green", icon: CalendarDays },
      { label: "Donors Reach", value: "1200", accent: "purple", icon: HeartPulse },
    ],
    primaryTitle: "Upcoming Campaigns",
    primarySubtitle: "Community donor events",
    primaryAction: "Campaigns",
    primaryType: "list",
    primaryItems: [
      { title: "Nairobi Blood Drive", meta: "KNH • 20 March 2026", sub: "Recruiting donors", status: "Open" },
      { title: "Community Blood Drive", meta: "Westlands • 5 April 2026", sub: "Target 120 donors", status: "Planned" },
    ],
    secondaryTitle: "Community Outreach",
    secondarySubtitle: "Volunteer and partner activity",
    secondaryAction: "Outreach",
    secondaryItems: [
      { title: "School outreach", meta: "30 volunteers enrolled", sub: "Campaign packet prepared", action: "Review" },
      { title: "Corporate partners", meta: "3 partners active", sub: "Blood drive sponsorship", action: "Open" },
    ],
    secondaryCta: "View Community Outreach",
    ctaLabel: "Create Campaign",
    ctaAction: "Campaigns",
    bloodBadge: "Community",
  },
  ADMIN: {
    title: "Admin Dashboard",
    subtitle: "Platform oversight and controls.",
    welcome: "Welcome",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Users", icon: Users },
      { label: "Hospitals", icon: Building2 },
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
  const [donorCampaigns, setDonorCampaigns] = useState([]);
  const [donorDashboardLoading, setDonorDashboardLoading] = useState(true);
  const [donorDashboardError, setDonorDashboardError] = useState("");
  const [donorDashboardRefresh, setDonorDashboardRefresh] = useState(0);
  const [patientProfile, setPatientProfile] = useState(null);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [hospitalProfile, setHospitalProfile] = useState(null);
  const [ngoProfile, setNgoProfile] = useState(null);
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
  const isHospitalDonationNeedsPage = role === "HOSPITAL_STAFF" && location.pathname === "/hospital/donation-needs";
  const isHospitalAppointmentsPage = role === "HOSPITAL_STAFF" && location.pathname === "/hospital/appointments";
  const isHospitalStaffPage = role === "HOSPITAL_STAFF" && location.pathname === "/hospital/staff";
  const isPatientAppointmentsPage = role === "PATIENT" && location.pathname === "/patient/appointments";
  const isPatientMedicalNotesPage = role === "PATIENT" && location.pathname === "/patient/medical-notes";
  const isNotificationPage = location.pathname === "/notifications";
  const isNgoCampaignsPage = role === "NGO" && location.pathname === "/ngo/campaigns";
  const isNgoOutreachPage = role === "NGO" && location.pathname === "/ngo/outreach";
  const isNgoNotificationsPage = role === "NGO" && location.pathname === "/ngo/notifications";
  const isNgoReportsPage = role === "NGO" && location.pathname === "/ngo/reports";
  const donorPage = {
    "/donor/profile": { label: "My Profile", subtitle: "Manage your donor details." },
    "/donor/donations": { label: "Donation History", subtitle: "Review your recorded donations." },
    "/donor/appointments": { label: "Appointments", subtitle: "Manage your donation visits." },
    "/donor/alerts": { label: "Emergency Alerts", subtitle: "Find requests that match your blood type." },
    "/donor/campaigns": { label: "Campaigns", subtitle: "Browse and join blood donation campaigns." },
  }[location.pathname];
  const patientPage = {
    "/patient/requests": { label: "Request Assistance", subtitle: "Submit an enquiry and track hospital-verified requests." },
    "/patient/appointments": { label: "Appointments", subtitle: "Review appointments recorded by your care team." },
    "/patient/medical-notes": { label: "Medical Notes", subtitle: "Review notes recorded for your appointments and blood requests." },
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
            setPatientProfile(null);
          })
          .catch((error) => reportError("Profile", error)),
        donorAPI.getAlerts()
          .then((response) => {
            if (!cancelled) setDonorAlerts(response?.data?.alerts || []);
          })
          .catch((error) => reportError("Emergency alerts", error)),
        donorAPI.getCampaigns()
          .then((response) => {
            if (!cancelled) setDonorCampaigns(response?.data?.campaigns || []);
          })
          .catch((error) => reportError("Campaigns", error)),
      ]).then((errors) => {
        if (!cancelled) setDonorDashboardError(errors.filter(Boolean).join(" "));
      }).finally(() => {
        if (!cancelled) setDonorDashboardLoading(false);
      });

      return () => { cancelled = true; };
    }

    if (role === "PATIENT") {
      patientAPI
        .getProfile()
        .then((response) => {
          setPatientProfile(response?.data || null);
          setDonorProfile(null);
          setHospitalProfile(null);
        })
        .catch(() => {
          setMessage("Unable to load patient details. Please try again later.");
        });
      return;
    }

    if (role === "HOSPITAL_STAFF") {
      hospitalAPI
        .getProfile()
        .then((response) => {
          setHospitalProfile(response?.data || null);
          setDonorProfile(null);
          setPatientProfile(null);
          setNgoProfile(null);
        })
        .catch(() => {
          setMessage("Unable to load hospital staff details. Please try again later.");
        });
      return;
    }

    if (role === "NGO") {
      ngoAPI
        .getProfile()
        .then((response) => {
          setNgoProfile(response?.data || null);
          setDonorProfile(null);
          setPatientProfile(null);
          setHospitalProfile(null);
        })
        .catch(() => {
          setMessage("Unable to load NGO details. Please try again later.");
        });
      return;
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
        {
          label: "Active Campaigns",
          value: String(donorCampaigns.length),
          accent: "purple",
          icon: Megaphone,
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

  const patientStats = patientProfile
    ? [
        {
          label: "Open Requests",
          value: String(patientProfile.metrics?.openRequests ?? 0),
          accent: "blue",
          icon: ClipboardList,
        },
        {
          label: "Urgent Needs",
          value: String(patientProfile.metrics?.urgentNeeds ?? 0),
          accent: "gold",
          icon: HeartPulse,
        },
        {
          label: "Upcoming Visits",
          value: String(patientProfile.metrics?.upcomingVisits ?? 0),
          accent: "green",
          icon: CalendarDays,
        },
        {
          label: "Notifications",
          value: String(patientProfile.metrics?.notifications ?? 0),
          accent: "purple",
          icon: Bell,
        },
      ]
    : currentRole.stats;

  const patientPrimaryItems = patientProfile
    ? patientProfile.requestHistory.map((item) => ({
        title: item.title,
        meta: item.meta,
        sub: item.sub,
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

  const ngoStats = ngoProfile
    ? [
        {
          label: "Campaigns",
          value: String(ngoProfile.metrics?.campaigns ?? 0),
          accent: "blue",
          icon: Megaphone,
        },
        {
          label: "Volunteers",
          value: String(ngoProfile.metrics?.volunteers ?? 0),
          accent: "gold",
          icon: Users,
        },
        {
          label: "Partner Hospitals",
          value: String(ngoProfile.metrics?.partnerHospitals ?? 0),
          accent: "green",
          icon: Building2,
        },
        {
          label: "Active Campaigns",
          value: String(ngoProfile.metrics?.activeCampaigns ?? 0),
          accent: "purple",
          icon: HeartPulse,
        },
      ]
    : currentRole.stats;

  const ngoPrimaryItems = ngoProfile
    ? (ngoProfile.campaigns || []).map((item) => ({
        title: item.title,
        meta: item.meta,
        sub: item.sub,
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
    : role === "PATIENT" && patientProfile
      ? {
          ...currentRole,
          stats: patientStats,
          primaryItems: patientPrimaryItems,
          secondaryItems: globalNotifications.slice(0, 3).map((notification) => ({
            title: notification.title || "Notification",
            meta: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(notification.createdAt)),
            sub: notification.message,
            action: "Open",
          })),
          bloodBadge: patientProfile.user?.bloodType || currentRole.bloodBadge,
        }
      : role === "HOSPITAL_STAFF" && hospitalProfile
        ? {
            ...currentRole,
            stats: hospitalStats,
            primaryItems: hospitalPrimaryItems,
            bloodBadge: hospitalProfile.user?.hospitalName || currentRole.bloodBadge,
          }
        : role === "NGO" && ngoProfile
          ? {
              ...currentRole,
              stats: ngoStats,
              primaryItems: ngoPrimaryItems,
              bloodBadge: ngoProfile.user?.ngoName || currentRole.bloodBadge,
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
      : isHospitalDonationNeedsPage
        ? "Donation Needs"
      : isHospitalAppointmentsPage
        ? "Appointments"
        : isHospitalStaffPage ? "Staff" : null;
  const activeNavigationLabel = donorPage?.label || patientPage?.label || (role === "PATIENT" && isNotificationPage ? "Notifications" : null) || hospitalPageLabel || (isAdminUsersPage
    ? "Users"
    : isAdminHospitalsPage
      ? "Hospitals"
      : isAdminInventoryPage ? "Inventory" : isNgoCampaignsPage ? "Campaigns" : isNgoOutreachPage ? "Outreach" : isNgoNotificationsPage ? "Notifications" : isNgoReportsPage ? "Reports" : "Dashboard");

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
        Campaigns: "/donor/campaigns",
      };

      if (donorRoutes[label]) {
        setMessage("");
        navigate(donorRoutes[label]);
        return;
      }
    }

    if (role === "PATIENT" && label === "Request Assistance") {
      setMessage("");
      navigate("/patient/requests");
      return;
    }

    if (role === "PATIENT" && ["Appointments", "Medical Notes", "Notifications", "Open Notifications", "My Requests"].includes(label)) {
      setMessage("");
      const patientRoutes = {
        Appointments: "/patient/appointments",
        "Medical Notes": "/patient/medical-notes",
        Notifications: "/notifications",
        "Open Notifications": "/notifications",
        "My Requests": "/patient/requests",
      };
      navigate(patientRoutes[label]);
      return;
    }

    if (role === "HOSPITAL_STAFF" && ["Inventory", "Requests", "Donation Needs"].includes(label)) {
      setMessage("");
      const hospitalRoutes = { Inventory: "/hospital/inventory", Requests: "/hospital/requests", "Donation Needs": "/hospital/donation-needs" };
      navigate(hospitalRoutes[label]);
      return;
    }

    if (role === "HOSPITAL_STAFF" && ["Appointments", "Staff"].includes(label)) {
      setMessage("");
      navigate(label === "Appointments" ? "/hospital/appointments" : "/hospital/staff");
      return;
    }

    if (role === "NGO" && ["Campaigns", "Outreach", "Notifications", "Reports"].includes(label)) {
      setMessage("");
      const ngoRoutes = {
        Campaigns: "/ngo/campaigns",
        Outreach: "/ngo/outreach",
        Notifications: "/ngo/notifications",
        Reports: "/ngo/reports",
      };
      navigate(ngoRoutes[label]);
      return;
    }

    if (role === "ADMIN" && label === "Users") {
      setMessage("");
      navigate("/admin/users");
      return;
    }

    if (role === "ADMIN" && label === "Hospitals") {
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
      navigate(role === "ADMIN" ? "/admin-dashboard" : "/dashboard");
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

  function refreshPatientProfile() {
    patientAPI.getProfile()
      .then((response) => setPatientProfile(response?.data || null))
      .catch(() => setMessage("Unable to refresh your patient dashboard."));
  }

  function handlePatientNotificationRead(notificationId) {
    setGlobalNotifications((current) => current.map((notification) =>
      notification.notificationId === notificationId
        ? { ...notification, status: "READ", readAt: new Date().toISOString() }
        : notification
    ));
    setUnreadNotificationCount((current) => Math.max(0, current - 1));
  }

  function refreshHospitalProfile() {
    hospitalAPI.getProfile()
      .then((response) => setHospitalProfile(response?.data || null))
      .catch(() => setMessage("Unable to refresh your hospital dashboard."));
  }

  function refreshNgoProfile() {
    ngoAPI.getProfile()
      .then((response) => setNgoProfile(response?.data || null))
      .catch(() => setMessage("Unable to refresh your NGO dashboard."));
  }

  const donorPageContent = {
    "/donor/profile": <DonorProfilePage onProfileUpdated={handleDonorProfileUpdated} />,
    "/donor/donations": <DonorDonationsPage />,
    "/donor/appointments": <DonorAppointmentsPage />,
    "/donor/alerts": <DonorAlertsPage />,
    "/donor/campaigns": <DonorCampaignsPage />,
  }[location.pathname];
  const patientPageContent = location.pathname === "/patient/requests"
    ? <PatientRequestsPage onRequestCreated={refreshPatientProfile} onNotificationRead={handlePatientNotificationRead} />
    : isPatientAppointmentsPage
      ? <PatientAppointmentsPage />
      : isPatientMedicalNotesPage ? <PatientMedicalNotesPage /> : null;
  const hospitalPageContent = isHospitalInventoryPage
    ? <HospitalInventoryPage onInventoryUpdated={refreshHospitalProfile} />
    : isHospitalRequestsPage
      ? <HospitalRequestsPage onRequestUpdated={refreshHospitalProfile} />
      : isHospitalDonationNeedsPage
        ? <HospitalDonationNeedsPage />
      : isHospitalAppointmentsPage
        ? <HospitalAppointmentsPage onAppointmentUpdated={refreshHospitalProfile} />
        : isHospitalStaffPage ? <HospitalStaffPage /> : null;
    const ngoPageContent = isNgoCampaignsPage
      ? <NgoCampaignsPage onCampaignChanged={refreshNgoProfile} />
      : isNgoOutreachPage
        ? <NgoOutreachPage />
        : isNgoNotificationsPage
          ? <NgoNotificationsPage onUnreadCountChange={setUnreadNotificationCount} />
          : isNgoReportsPage ? <NgoReportsPage /> : null;

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
                {isNotificationPage ? "Notifications" : donorPage?.label || patientPage?.label || (isNgoCampaignsPage || isNgoOutreachPage || isNgoNotificationsPage || isNgoReportsPage
                  ? isNgoCampaignsPage ? "Campaign Management" : isNgoOutreachPage ? "Community Outreach" : isNgoNotificationsPage ? "Notifications" : "Reports"
                  : isHospitalInventoryPage
                  ? "Blood Inventory"
                  : isHospitalRequestsPage
                    ? "Hospital Request Coordination"
                    : isHospitalDonationNeedsPage
                      ? "Donation Needs"
                    : isHospitalAppointmentsPage
                      ? "Appointments"
                      : isHospitalStaffPage ? "Hospital Staff" : isAdminUsersPage
                  ? "User Accounts"
                  : isAdminHospitalsPage
                    ? "Hospital Directory"
                    : isAdminInventoryPage ? "Blood Inventory" : effectiveRole.title)}
              </div>
              <div className="page-subtitle">
                {isNotificationPage ? "Updates and reminders for your HemoConnect account." : donorPage?.subtitle || patientPage?.subtitle || (isNgoCampaignsPage || isNgoOutreachPage || isNgoNotificationsPage || isNgoReportsPage
                  ? isNgoCampaignsPage ? "Create and coordinate campaigns for your organization." : isNgoOutreachPage ? "Plan and track community engagement activities." : isNgoNotificationsPage ? "Updates about your organization’s campaigns." : "Measure campaign and outreach activity."
                  : isHospitalInventoryPage
                  ? "Review and adjust blood stock at your hospital."
                  : isHospitalRequestsPage
                    ? "Create official requests, review assistance enquiries, and record fulfillment."
                    : isHospitalDonationNeedsPage
                      ? "Coordinate partner NGO campaigns around hospital blood needs."
                    : isHospitalAppointmentsPage
                      ? "Review and update appointments at your hospital."
                      : isHospitalStaffPage ? "Contact your hospital team." : isAdminUsersPage
                  ? "Manage platform account access."
                  : isAdminHospitalsPage
                    ? "Review hospital access and contact details."
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

          {role === "DONOR" && !donorPage && donorDashboardLoading ? (
            <div className="donor-page-state" role="status">Loading your dashboard...</div>
          ) : role === "DONOR" && donorPage ? (
            donorPageContent
          ) : isNotificationPage ? (
            <NotificationsPage onUnreadCountChange={setUnreadNotificationCount} />
          ) : role === "PATIENT" && patientPage ? (
            patientPageContent
          ) : hospitalPageLabel ? (
            hospitalPageContent
          ) : isNgoCampaignsPage || isNgoOutreachPage || isNgoNotificationsPage || isNgoReportsPage ? (
            ngoPageContent
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
