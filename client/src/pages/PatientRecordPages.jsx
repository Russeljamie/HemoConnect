import { useEffect, useState } from "react";
import { CalendarDays, FileText } from "lucide-react";

import { patientAPI } from "../services/api";
import "./donor-pages.css";
import "./patient-pages.css";

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

export function PatientAppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    patientAPI.getAppointments()
      .then((response) => {
        if (!cancelled) setAppointments(response.data.appointments || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load your appointments."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="donor-page-panel patient-requests-page" aria-labelledby="patient-appointments-heading">
      <header className="donor-page-heading">
        <div><h1 id="patient-appointments-heading">Appointments</h1><p>Appointments recorded for you and any patient records shared with your account.</p></div>
        <CalendarDays size={22} aria-hidden="true" />
      </header>
      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {loading ? <div className="donor-page-state" role="status">Loading appointments...</div>
        : appointments.length === 0 ? <div className="donor-page-state">No appointments have been recorded for your patient records.</div>
          : <div className="patient-record-list">
            {appointments.map((appointment) => (
              <article className="patient-record-card" key={appointment.appointmentId}>
                <div>
                  <strong>{appointment.purpose}</strong>
                  <p>{formatDate(appointment.date)} · {appointment.time}</p>
                  <small>{appointment.hospital?.name || "Hospital not specified"}{appointment.hospital?.location ? ` · ${appointment.hospital.location}` : ""}</small>
                  {appointment.notes && <p>{appointment.notes}</p>}
                </div>
                <span className="donor-status-tag">{appointment.status}</span>
              </article>
            ))}
          </div>}
    </section>
  );
}

export function PatientMedicalNotesPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    patientAPI.getMedicalNotes()
      .then((response) => {
        if (!cancelled) setNotes(response.data.notes || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load your medical notes."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="donor-page-panel patient-requests-page" aria-labelledby="patient-medical-notes-heading">
      <header className="donor-page-heading">
        <div><h1 id="patient-medical-notes-heading">Medical Notes</h1><p>Notes recorded by your hospital care team on appointments and blood requests.</p></div>
        <FileText size={22} aria-hidden="true" />
      </header>
      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {loading ? <div className="donor-page-state" role="status">Loading medical notes...</div>
        : notes.length === 0 ? <div className="donor-page-state">No medical notes have been recorded for your patient records.</div>
          : <div className="patient-record-list">
            {notes.map((note) => (
              <article className="patient-record-card" key={note.id}>
                <div>
                  <strong>{note.title}</strong>
                  <p>{note.text}</p>
                  <small>{note.author} · {formatDate(note.date)}</small>
                </div>
              </article>
            ))}
          </div>}
    </section>
  );
}
