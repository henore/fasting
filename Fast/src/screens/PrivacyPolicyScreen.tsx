import React from 'react';
import {ScrollView, Text, StyleSheet, View, Linking, TouchableOpacity} from 'react-native';

const POLICY_URL = 'mailto:msz006.kobo@gmail.com';

const sections = [
  {
    title: '1. Information We Collect',
    body: 'Fast does not require you to create an account or provide personal information such as your name, email address, phone number, or address.\n\nFasting records, settings, goals, reminders, and other App data are stored locally on your device.\n\nFast does not operate its own server for collecting or storing your fasting history.',
  },
  {
    title: '2. Fasting and Health-Related Data',
    body: 'The App may store information such as:\n\n• Meal times\n• Fasting start and end times\n• Fasting duration\n• Fasting goals\n• Reminder settings\n• Fasting history and statistics\n\nThis information is stored locally on your device and is not transmitted to our servers.\n\nFast is intended for general wellness and informational purposes only. It is not a medical device and does not provide medical diagnosis, treatment, or professional medical advice.',
  },
  {
    title: '3. Advertising',
    body: 'The free version of Fast may display advertisements provided by Google AdMob.\n\nGoogle AdMob may collect or process certain information, such as device identifiers, advertising identifiers, IP addresses, approximate location, and information about interactions with advertisements.\n\nFast may also offer optional rewarded advertisements that allow users to temporarily access certain Pro features.\n\nThe handling of information by Google is governed by Google\'s own privacy policies.',
  },
  {
    title: '4. In-App Purchases',
    body: 'Fast may offer a one-time Pro purchase through Google Play.\n\nPayment and purchase information is processed by Google Play. Fast does not receive or store your full payment card or banking information.\n\nThe App may receive information necessary to confirm whether a Pro purchase has been successfully completed.',
  },
  {
    title: '5. Notifications',
    body: 'Fast may request permission to send notifications for fasting goals and reminders.\n\nNotification settings and fasting schedules are processed on your device.\n\nYou can disable notifications at any time through your device settings.',
  },
  {
    title: '6. Data Sharing',
    body: 'We do not sell your personal information.\n\nFast does not share your fasting history with third parties.\n\nThird-party services used by the App, such as Google AdMob and Google Play, may process limited information according to their own privacy policies and applicable laws.',
  },
  {
    title: '7. Data Retention and Deletion',
    body: 'Fasting records and settings are stored locally on your device.\n\nYou can remove locally stored App data by using available deletion features within the App or by uninstalling the App.\n\nUninstalling the App may permanently delete locally stored data unless it has been backed up separately by your device or operating system.',
  },
  {
    title: '8. Children\'s Privacy',
    body: 'Fast is not specifically directed toward children.\n\nWe do not knowingly collect personal information directly from children through our own servers.\n\nThird-party services used by the App may apply their own age-related policies and protections.',
  },
  {
    title: '9. Security',
    body: 'Because Fast stores its primary user data locally on your device, the security of that data also depends on the security of your device and operating system.\n\nWe take reasonable steps to minimize unnecessary collection and transmission of user information.',
  },
  {
    title: '10. Changes to This Privacy Policy',
    body: 'This Privacy Policy may be updated when the App\'s features, third-party services, or legal requirements change.\n\nAny updated version will be published with a revised "Last updated" date.',
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Privacy Policy for Fast</Text>
        <Text style={styles.updated}>Last updated: September 8, 2026</Text>
        <Text style={styles.intro}>
          Fast ("the App") is a simple fasting timer designed to work primarily
          on your device.{'\n\n'}This Privacy Policy explains what information
          the App handles and how it is used.
        </Text>

        {sections.map(s => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>11. Contact</Text>
          <Text style={styles.body}>
            If you have questions about this Privacy Policy, please contact:
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL(POLICY_URL)}>
            <Text style={styles.link}>msz006.kobo@gmail.com</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
  },
  heading: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  updated: {
    color: '#888',
    fontSize: 13,
    marginBottom: 16,
  },
  intro: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  body: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 21,
  },
  link: {
    color: '#4A90D9',
    fontSize: 14,
    marginTop: 4,
  },
  footer: {
    height: 40,
  },
});
