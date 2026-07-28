import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

interface Worker {
  id: string;
  name: string;
  phone: string;
  skill: string;
  experience: number;
  dailyRate: number;
  status: "Available" | "On Assignment" | "On Leave";
  rating: number;
}

interface JobPosting {
  id: string;
  title: string;
  client: string;
  location: string;
  duration: string;
  workersNeeded: number;
  workersAssigned: number;
  ratePerDay: number;
  status: "Open" | "Filled" | "In Progress" | "Completed";
}

interface AttendanceRecord {
  id: string;
  workerName: string;
  checkIn: string;
  checkOut: string;
  status: "Present" | "Absent" | "Half-Day";
}

const SKILL_OPTIONS = [
  "Plumber",
  "Electrician",
  "Driver",
  "Cook",
  "Security Guard",
  "Carpenter",
  "Painter",
  "Helper",
];

const STATUS_COLORS: Record<string, string> = {
  Available: Colors.success,
  "On Assignment": Colors.info,
  "On Leave": Colors.warning,
  Open: Colors.info,
  Filled: Colors.success,
  "In Progress": "#8B5CF6",
  Completed: Colors.textSecondary,
  Present: Colors.success,
  Absent: Colors.error,
  "Half-Day": Colors.warning,
};

const initialWorkers: Worker[] = [
  { id: "w1", name: "Rajesh Kumar", phone: "+91 98765 43210", skill: "Plumber", experience: 8, dailyRate: 650, status: "Available", rating: 4.5 },
  { id: "w2", name: "Sunil Yadav", phone: "+91 87654 32109", skill: "Electrician", experience: 12, dailyRate: 800, status: "On Assignment", rating: 4.8 },
  { id: "w3", name: "Amit Singh", phone: "+91 76543 21098", skill: "Driver", experience: 5, dailyRate: 550, status: "Available", rating: 4.2 },
  { id: "w4", name: "Deepak Sharma", phone: "+91 65432 10987", skill: "Cook", experience: 10, dailyRate: 700, status: "On Leave", rating: 4.6 },
  { id: "w5", name: "Vikram Patel", phone: "+91 54321 09876", skill: "Security Guard", experience: 6, dailyRate: 500, status: "Available", rating: 4.0 },
  { id: "w6", name: "Manoj Verma", phone: "+91 43210 98765", skill: "Carpenter", experience: 15, dailyRate: 900, status: "On Assignment", rating: 4.9 },
  { id: "w7", name: "Ravi Gupta", phone: "+91 32109 87654", skill: "Painter", experience: 7, dailyRate: 600, status: "Available", rating: 4.3 },
  { id: "w8", name: "Karan Joshi", phone: "+91 21098 76543", skill: "Helper", experience: 2, dailyRate: 400, status: "Available", rating: 3.8 },
];

const initialJobPostings: JobPosting[] = [
  { id: "j1", title: "Need 5 Painters for 3 days", client: "Sunrise Builders", location: "Andheri West, Mumbai", duration: "3 Days", workersNeeded: 5, workersAssigned: 3, ratePerDay: 650, status: "Open" },
  { id: "j2", title: "Electrician for factory wiring", client: "Tata Industries", location: "Pune Industrial Area", duration: "2 Weeks", workersNeeded: 3, workersAssigned: 3, ratePerDay: 850, status: "In Progress" },
  { id: "j3", title: "Security Guards for event", client: "Grand Hyatt", location: "BKC, Mumbai", duration: "1 Day", workersNeeded: 8, workersAssigned: 8, ratePerDay: 550, status: "Filled" },
  { id: "j4", title: "Plumbing work for apartment", client: "DLF Housing", location: "Gurgaon Sector 45", duration: "5 Days", workersNeeded: 2, workersAssigned: 2, ratePerDay: 700, status: "Completed" },
];

const initialAttendance: AttendanceRecord[] = [
  { id: "a1", workerName: "Sunil Yadav", checkIn: "08:00 AM", checkOut: "06:00 PM", status: "Present" },
  { id: "a2", workerName: "Manoj Verma", checkIn: "09:00 AM", checkOut: "05:30 PM", status: "Present" },
  { id: "a3", workerName: "Ravi Gupta", checkIn: "08:30 AM", checkOut: "01:00 PM", status: "Half-Day" },
  { id: "a4", workerName: "Vikram Patel", checkIn: "--", checkOut: "--", status: "Absent" },
  { id: "a5", workerName: "Amit Singh", checkIn: "07:45 AM", checkOut: "06:15 PM", status: "Present" },
];

export default function VendorManpower() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [workers, setWorkers] = useState<Worker[]>(initialWorkers);
  const [jobPostings, setJobPostings] = useState<JobPosting[]>(initialJobPostings);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance);

  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showAddJob, setShowAddJob] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);

  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerPhone, setNewWorkerPhone] = useState("");
  const [newWorkerSkill, setNewWorkerSkill] = useState("");
  const [newWorkerExperience, setNewWorkerExperience] = useState("");
  const [newWorkerRate, setNewWorkerRate] = useState("");

  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobClient, setNewJobClient] = useState("");
  const [newJobLocation, setNewJobLocation] = useState("");
  const [newJobDuration, setNewJobDuration] = useState("");
  const [newJobWorkersNeeded, setNewJobWorkersNeeded] = useState("");
  const [newJobRate, setNewJobRate] = useState("");

  const availableWorkers = workers.filter((w) => w.status === "Available").length;
  const onAssignment = workers.filter((w) => w.status === "On Assignment").length;
  const avgRate = Math.round(workers.reduce((s, w) => s + w.dailyRate, 0) / workers.length);

  const presentCount = attendance.filter((a) => a.status === "Present").length;
  const absentCount = attendance.filter((a) => a.status === "Absent").length;
  const halfDayCount = attendance.filter((a) => a.status === "Half-Day").length;

  const handleBack = () => {
    try { Haptics.selectionAsync(); } catch {}
    router.back();
  };

  const handleAddWorker = () => {
    if (!newWorkerName.trim() || !newWorkerPhone.trim() || !newWorkerSkill || !newWorkerExperience || !newWorkerRate) {
      Alert.alert("Missing Fields", "Please fill in all fields to add a worker.");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    const worker: Worker = {
      id: "w" + Date.now().toString(),
      name: newWorkerName.trim(),
      phone: newWorkerPhone.trim(),
      skill: newWorkerSkill,
      experience: parseInt(newWorkerExperience) || 0,
      dailyRate: parseInt(newWorkerRate) || 0,
      status: "Available",
      rating: 4.0,
    };
    setWorkers((prev) => [worker, ...prev]);
    setNewWorkerName("");
    setNewWorkerPhone("");
    setNewWorkerSkill("");
    setNewWorkerExperience("");
    setNewWorkerRate("");
    setShowAddWorker(false);
  };

  const handleAddJob = () => {
    if (!newJobTitle.trim() || !newJobClient.trim() || !newJobLocation.trim() || !newJobDuration.trim() || !newJobWorkersNeeded || !newJobRate) {
      Alert.alert("Missing Fields", "Please fill in all fields to post a job.");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    const job: JobPosting = {
      id: "j" + Date.now().toString(),
      title: newJobTitle.trim(),
      client: newJobClient.trim(),
      location: newJobLocation.trim(),
      duration: newJobDuration.trim(),
      workersNeeded: parseInt(newJobWorkersNeeded) || 0,
      workersAssigned: 0,
      ratePerDay: parseInt(newJobRate) || 0,
      status: "Open",
    };
    setJobPostings((prev) => [job, ...prev]);
    setNewJobTitle("");
    setNewJobClient("");
    setNewJobLocation("");
    setNewJobDuration("");
    setNewJobWorkersNeeded("");
    setNewJobRate("");
    setShowAddJob(false);
  };

  const cycleAttendance = (id: string) => {
    try { Haptics.selectionAsync(); } catch {}
    setAttendance((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const next = a.status === "Present" ? "Half-Day" : a.status === "Half-Day" ? "Absent" : "Present";
        return {
          ...a,
          status: next,
          checkIn: next === "Absent" ? "--" : next === "Half-Day" ? "08:30 AM" : "08:00 AM",
          checkOut: next === "Absent" ? "--" : next === "Half-Day" ? "01:00 PM" : "06:00 PM",
        };
      })
    );
  };

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= Math.floor(rating) ? "star" : i - rating < 1 ? "star-half" : "star-outline"}
          size={14}
          color="#F59E0B"
        />
      );
    }
    return stars;
  };

  const getSkillIcon = (skill: string): string => {
    const icons: Record<string, string> = {
      Plumber: "water",
      Electrician: "flash",
      Driver: "car",
      Cook: "restaurant",
      "Security Guard": "shield-checkmark",
      Carpenter: "hammer",
      Painter: "color-palette",
      Helper: "hand-left",
    };
    return icons[skill] || "person";
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Manpower Management</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: bottomInset + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={[Colors.primary, "#E55D00"]} style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Workforce Summary</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{workers.length}</Text>
              <Text style={styles.summaryLabel}>Total Workers</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{availableWorkers}</Text>
              <Text style={styles.summaryLabel}>Available</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{onAssignment}</Text>
              <Text style={styles.summaryLabel}>On Assignment</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{"\u20B9"}{avgRate}</Text>
              <Text style={styles.summaryLabel}>Avg Daily Rate</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Worker Profiles</Text>
            <Pressable style={styles.addBtn} onPress={() => { try { Haptics.selectionAsync(); } catch {} setShowAddWorker(true); }}>
              <Ionicons name="add-circle" size={20} color={Colors.primary} />
              <Text style={styles.addBtnText}>Add Worker</Text>
            </Pressable>
          </View>

          {workers.map((worker) => (
            <View key={worker.id} style={styles.workerCard}>
              <View style={styles.workerTop}>
                <View style={[styles.avatar, { backgroundColor: STATUS_COLORS[worker.status] + "20" }]}>
                  <Text style={[styles.avatarText, { color: STATUS_COLORS[worker.status] }]}>
                    {getInitials(worker.name)}
                  </Text>
                </View>
                <View style={styles.workerInfo}>
                  <Text style={styles.workerName}>{worker.name}</Text>
                  <View style={styles.workerMeta}>
                    <Ionicons name="call-outline" size={12} color={Colors.textSecondary} />
                    <Text style={styles.workerPhone}>{worker.phone}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[worker.status] + "18" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[worker.status] }]}>{worker.status}</Text>
                </View>
              </View>
              <View style={styles.workerDetails}>
                <View style={styles.detailChip}>
                  <Ionicons name={getSkillIcon(worker.skill) as any} size={14} color={Colors.primary} />
                  <Text style={styles.detailText}>{worker.skill}</Text>
                </View>
                <View style={styles.detailChip}>
                  <Ionicons name="time-outline" size={14} color={Colors.info} />
                  <Text style={styles.detailText}>{worker.experience} yrs</Text>
                </View>
                <View style={styles.detailChip}>
                  <Ionicons name="cash-outline" size={14} color={Colors.success} />
                  <Text style={styles.detailText}>{"\u20B9"}{worker.dailyRate}/day</Text>
                </View>
              </View>
              <View style={styles.ratingRow}>
                <View style={styles.starsRow}>{renderStars(worker.rating)}</View>
                <Text style={styles.ratingText}>{worker.rating.toFixed(1)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active Job Postings</Text>
            <Pressable style={styles.addBtn} onPress={() => { try { Haptics.selectionAsync(); } catch {} setShowAddJob(true); }}>
              <Ionicons name="add-circle" size={20} color={Colors.primary} />
              <Text style={styles.addBtnText}>Post Job</Text>
            </Pressable>
          </View>

          {jobPostings.map((job) => (
            <View key={job.id} style={styles.jobCard}>
              <View style={styles.jobTop}>
                <Text style={styles.jobTitle}>{job.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[job.status] + "18" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[job.status] }]}>{job.status}</Text>
                </View>
              </View>
              <View style={styles.jobDetails}>
                <View style={styles.jobDetailRow}>
                  <Ionicons name="business-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.jobDetailText}>{job.client}</Text>
                </View>
                <View style={styles.jobDetailRow}>
                  <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.jobDetailText}>{job.location}</Text>
                </View>
                <View style={styles.jobDetailRow}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.jobDetailText}>{job.duration}</Text>
                </View>
              </View>
              <View style={styles.jobFooter}>
                <View style={styles.jobStat}>
                  <Text style={styles.jobStatLabel}>Workers</Text>
                  <Text style={styles.jobStatValue}>{job.workersAssigned}/{job.workersNeeded}</Text>
                </View>
                <View style={styles.jobStat}>
                  <Text style={styles.jobStatLabel}>Rate/Day</Text>
                  <Text style={styles.jobStatValue}>{"\u20B9"}{job.ratePerDay}</Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${(job.workersAssigned / job.workersNeeded) * 100}%` }]} />
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attendance Tracker</Text>
          <Text style={styles.sectionSubtitle}>Today's Attendance</Text>

          <View style={styles.attendanceSummary}>
            <View style={[styles.attendanceStat, { backgroundColor: Colors.success + "15" }]}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={[styles.attendanceStatValue, { color: Colors.success }]}>{presentCount}</Text>
              <Text style={styles.attendanceStatLabel}>Present</Text>
            </View>
            <View style={[styles.attendanceStat, { backgroundColor: Colors.error + "15" }]}>
              <Ionicons name="close-circle" size={20} color={Colors.error} />
              <Text style={[styles.attendanceStatValue, { color: Colors.error }]}>{absentCount}</Text>
              <Text style={styles.attendanceStatLabel}>Absent</Text>
            </View>
            <View style={[styles.attendanceStat, { backgroundColor: Colors.warning + "15" }]}>
              <Ionicons name="time" size={20} color={Colors.warning} />
              <Text style={[styles.attendanceStatValue, { color: Colors.warning }]}>{halfDayCount}</Text>
              <Text style={styles.attendanceStatLabel}>Half-Day</Text>
            </View>
          </View>

          {attendance.map((record) => (
            <View key={record.id} style={styles.attendanceCard}>
              <View style={styles.attendanceLeft}>
                <Text style={styles.attendanceName}>{record.workerName}</Text>
                <View style={styles.attendanceTimes}>
                  <Text style={styles.timeText}>In: {record.checkIn}</Text>
                  <Text style={styles.timeSeparator}>|</Text>
                  <Text style={styles.timeText}>Out: {record.checkOut}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => cycleAttendance(record.id)}
                style={[styles.attendanceBadge, { backgroundColor: STATUS_COLORS[record.status] + "18" }]}
              >
                <Text style={[styles.attendanceBadgeText, { color: STATUS_COLORS[record.status] }]}>
                  {record.status}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Summary</Text>
          <Text style={styles.sectionSubtitle}>This Month</Text>

          <View style={styles.paymentGrid}>
            <View style={styles.paymentCard}>
              <View style={[styles.paymentIcon, { backgroundColor: Colors.error + "15" }]}>
                <Ionicons name="arrow-up" size={20} color={Colors.error} />
              </View>
              <Text style={styles.paymentAmount}>{"\u20B9"}1,85,000</Text>
              <Text style={styles.paymentLabel}>Paid to Workers</Text>
            </View>
            <View style={styles.paymentCard}>
              <View style={[styles.paymentIcon, { backgroundColor: Colors.success + "15" }]}>
                <Ionicons name="arrow-down" size={20} color={Colors.success} />
              </View>
              <Text style={styles.paymentAmount}>{"\u20B9"}2,45,000</Text>
              <Text style={styles.paymentLabel}>From Clients</Text>
            </View>
            <View style={styles.paymentCard}>
              <View style={[styles.paymentIcon, { backgroundColor: Colors.warning + "15" }]}>
                <Ionicons name="hourglass" size={20} color={Colors.warning} />
              </View>
              <Text style={styles.paymentAmount}>{"\u20B9"}42,500</Text>
              <Text style={styles.paymentLabel}>Pending</Text>
            </View>
            <View style={styles.paymentCard}>
              <View style={[styles.paymentIcon, { backgroundColor: Colors.primary + "15" }]}>
                <Ionicons name="wallet" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.paymentAmount}>{"\u20B9"}17,500</Text>
              <Text style={styles.paymentLabel}>Commission</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showAddWorker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Worker</Text>
              <Pressable onPress={() => setShowAddWorker(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter worker name"
                placeholderTextColor={Colors.textLight}
                value={newWorkerName}
                onChangeText={setNewWorkerName}
              />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 XXXXX XXXXX"
                placeholderTextColor={Colors.textLight}
                value={newWorkerPhone}
                onChangeText={setNewWorkerPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Skill Category</Text>
              <Pressable style={styles.input} onPress={() => setShowSkillPicker(true)}>
                <Text style={newWorkerSkill ? styles.inputText : styles.placeholderText}>
                  {newWorkerSkill || "Select skill category"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
              </Pressable>

              {showSkillPicker && (
                <View style={styles.skillPicker}>
                  {SKILL_OPTIONS.map((skill) => (
                    <Pressable
                      key={skill}
                      style={[styles.skillOption, newWorkerSkill === skill && styles.skillOptionSelected]}
                      onPress={() => {
                        setNewWorkerSkill(skill);
                        setShowSkillPicker(false);
                      }}
                    >
                      <Ionicons name={getSkillIcon(skill) as any} size={16} color={newWorkerSkill === skill ? "#FFF" : Colors.text} />
                      <Text style={[styles.skillOptionText, newWorkerSkill === skill && styles.skillOptionTextSelected]}>
                        {skill}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.inputLabel}>Experience (Years)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 5"
                placeholderTextColor={Colors.textLight}
                value={newWorkerExperience}
                onChangeText={setNewWorkerExperience}
                keyboardType="number-pad"
              />

              <Text style={styles.inputLabel}>Daily Rate ({"\u20B9"})</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 650"
                placeholderTextColor={Colors.textLight}
                value={newWorkerRate}
                onChangeText={setNewWorkerRate}
                keyboardType="number-pad"
              />

              <Pressable style={styles.submitBtn} onPress={handleAddWorker}>
                <LinearGradient colors={[Colors.primary, "#E55D00"]} style={styles.submitGradient}>
                  <Ionicons name="person-add" size={20} color="#FFF" />
                  <Text style={styles.submitText}>Add Worker</Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showAddJob} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post New Job</Text>
              <Pressable onPress={() => setShowAddJob(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Job Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Need 5 Painters for 3 days"
                placeholderTextColor={Colors.textLight}
                value={newJobTitle}
                onChangeText={setNewJobTitle}
              />

              <Text style={styles.inputLabel}>Client Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter client name"
                placeholderTextColor={Colors.textLight}
                value={newJobClient}
                onChangeText={setNewJobClient}
              />

              <Text style={styles.inputLabel}>Location</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter job location"
                placeholderTextColor={Colors.textLight}
                value={newJobLocation}
                onChangeText={setNewJobLocation}
              />

              <Text style={styles.inputLabel}>Duration</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 3 Days, 2 Weeks"
                placeholderTextColor={Colors.textLight}
                value={newJobDuration}
                onChangeText={setNewJobDuration}
              />

              <Text style={styles.inputLabel}>Workers Needed</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 5"
                placeholderTextColor={Colors.textLight}
                value={newJobWorkersNeeded}
                onChangeText={setNewJobWorkersNeeded}
                keyboardType="number-pad"
              />

              <Text style={styles.inputLabel}>Rate Per Day ({"\u20B9"})</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 650"
                placeholderTextColor={Colors.textLight}
                value={newJobRate}
                onChangeText={setNewJobRate}
                keyboardType="number-pad"
              />

              <Pressable style={styles.submitBtn} onPress={handleAddJob}>
                <LinearGradient colors={[Colors.primary, "#E55D00"]} style={styles.submitGradient}>
                  <Ionicons name="briefcase" size={20} color="#FFF" />
                  <Text style={styles.submitText}>Post Job</Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  summaryCard: { marginHorizontal: 16, marginTop: -1, borderRadius: 18, padding: 20 },
  summaryTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF", marginBottom: 14, opacity: 0.9 },
  summaryGrid: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryItem: { alignItems: "center", flex: 1 },
  summaryValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  summaryLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2, textAlign: "center" },
  summaryDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.25)" },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  sectionSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: -2, marginBottom: 14 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "12", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  addBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  workerCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  workerTop: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  workerInfo: { flex: 1, marginLeft: 12 },
  workerName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary },
  workerMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  workerPhone: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  workerDetails: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  detailChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.background, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  detailText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text },
  ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 },
  starsRow: { flexDirection: "row", gap: 2 },
  ratingText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  jobCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  jobTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  jobTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary, flex: 1, marginRight: 10 },
  jobDetails: { marginTop: 10, gap: 6 },
  jobDetailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  jobDetailText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  jobFooter: { flexDirection: "row", alignItems: "center", marginTop: 14, gap: 16 },
  jobStat: { alignItems: "center" },
  jobStatLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  jobStatValue: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary },
  progressBarContainer: { flex: 1, height: 6, backgroundColor: Colors.background, borderRadius: 3, overflow: "hidden" },
  progressBar: { height: "100%", backgroundColor: Colors.success, borderRadius: 3 },
  attendanceSummary: { flexDirection: "row", gap: 10, marginBottom: 14 },
  attendanceStat: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", gap: 4 },
  attendanceStatValue: { fontFamily: "Poppins_700Bold", fontSize: 22 },
  attendanceStatLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  attendanceCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  attendanceLeft: { flex: 1 },
  attendanceName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
  attendanceTimes: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  timeText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  timeSeparator: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight },
  attendanceBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  attendanceBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  paymentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  paymentCard: { width: "48%", backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  paymentIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  paymentAmount: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.secondary },
  paymentLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  inputLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inputText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text },
  placeholderText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight },
  skillPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  skillOption: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.background },
  skillOptionSelected: { backgroundColor: Colors.primary },
  skillOptionText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text },
  skillOptionTextSelected: { color: "#FFF" },
  submitBtn: { marginTop: 24, marginBottom: 10, borderRadius: 14, overflow: "hidden" },
  submitGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  submitText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
});
