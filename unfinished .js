import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Platform,
  StatusBar,
  Pressable,
  Alert,
  Share,
  Image,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

// Enable the relative time plugin for dayjs
dayjs.extend(relativeTime);

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Main application component
export default function App() {
  // State variables
  const [events, setEvents] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [eventImage, setEventImage] = useState(null);
  const [eventCategory, setEventCategory] = useState('event'); // Default category
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [activeTab, setActiveTab] = useState('Home');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  
  const notificationListener = useRef();
  const responseListener = useRef();

  // Theme colors based on mode
  const theme = {
    background: isDarkMode ? '#121212' : '#FFFFFF',
    headerBackground: isDarkMode ? '#D84315' : '#FF4500',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    cardBackground: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    inputBackground: isDarkMode ? '#333333' : '#F8F8F8',
    inputText: isDarkMode ? '#FFFFFF' : '#333333',
    placeholderText: isDarkMode ? '#999999' : '#999999',
    borderColor: isDarkMode ? '#444444' : '#F0F0F0',
  };

  // Load saved theme preference and events from AsyncStorage
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('theme');
        if (savedTheme !== null) {
          setIsDarkMode(savedTheme === 'dark');
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
      }
    };
    
    loadThemePreference();
    loadEvents();
    registerForPushNotifications();
    
    // Set up notification listeners
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  // Save theme preference
  const saveThemePreference = async (isDark) => {
    try {
      await AsyncStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  // Toggle theme
  const toggleTheme = () => {
    const newThemeValue = !isDarkMode;
    setIsDarkMode(newThemeValue);
    saveThemePreference(newThemeValue);
    setSettingsModalVisible(false);
  };

  // Register for push notifications
  const registerForPushNotifications = async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    // If we don't have permission already, ask for it
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      Alert.alert('Notification Permission', 'We need notification permissions to alert you about your events!');
      return;
    }
  };

  // Schedule notification for an event
  const scheduleNotifications = async (event) => {
    const eventTime = new Date(event.date);
    const notificationIds = [];
    
    // Calculate notification time (1 hour before the event)
    const oneHourBeforeTime = new Date(eventTime);
    oneHourBeforeTime.setHours(oneHourBeforeTime.getHours() - 1);
    
    // If the one hour before notification time is in the future, schedule it
    if (oneHourBeforeTime > new Date()) {
      const oneHourBeforeId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Upcoming Event: ' + event.name,
          body: `Your event "${event.name}" is starting in one hour!`,
          data: { eventId: event.id },
        },
        trigger: {
          date: oneHourBeforeTime,
        },
      });
      
      notificationIds.push({ id: oneHourBeforeId, type: 'oneHourBefore' });
    }
    
    // If the event time is in the future, schedule the "event starting now" notification
    if (eventTime > new Date()) {
      const eventStartId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Event Starting Now: ' + event.name,
          body: `Your event "${event.name}" is starting now!`,
          data: { eventId: event.id },
        },
        trigger: {
          date: eventTime,
        },
      });
      
      notificationIds.push({ id: eventStartId, type: 'eventStart' });
    }
    
    return notificationIds;
  };

  // Cancel existing notifications for an event
  const cancelEventNotifications = async (event) => {
    if (event.notificationIds && event.notificationIds.length > 0) {
      for (const notification of event.notificationIds) {
        await Notifications.cancelScheduledNotificationAsync(notification.id);
      }
    }
  };

  // Function to load events from AsyncStorage
  const loadEvents = async () => {
    try {
      const storedEvents = await AsyncStorage.getItem('events');
      if (storedEvents !== null) {
        // Parse the stored JSON and sort events by date
        const parsedEvents = JSON.parse(storedEvents);
        // Filter out past events
        const upcomingEvents = parsedEvents.filter(
          event => new Date(event.date) > new Date()
        );
        // Sort events by date (earliest first)
        upcomingEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
        setEvents(upcomingEvents);
      }
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  };

  // Function to save events to AsyncStorage
  const saveEvents = async (updatedEvents) => {
    try {
      await AsyncStorage.setItem('events', JSON.stringify(updatedEvents));
    } catch (error) {
      console.error('Failed to save events:', error);
    }
  };

  // Function to pick an image from gallery
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need access to your photos to add event images.');
      return;
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    
    if (!result.canceled) {
      setEventImage(result.assets[0].uri);
    }
  };

  // Function to add or update an event
  const saveEvent = async () => {
    if (eventName.trim() === '') {
      Alert.alert('Missing Information', 'Please enter an event name');
      return;
    }

    let updatedEvents = [];
    
    const eventData = {
      name: eventName,
      description: eventDescription,
      date: eventDate.toISOString(),
      image: eventImage,
      category: eventCategory,
    };
    
    if (editingEventId) {
      // Update existing event
      const existingEvent = events.find(event => event.id === editingEventId);
      
      // Cancel existing notifications
      await cancelEventNotifications(existingEvent);
      
      // Schedule new notifications
      const notificationIds = await scheduleNotifications({
        ...existingEvent,
        ...eventData
      });
      
      const updatedEvent = {
        ...existingEvent,
        ...eventData,
        notificationIds: notificationIds,
      };
      
      updatedEvents = events.map(event => 
        event.id === editingEventId ? updatedEvent : event
      );
    } else {
      // Add new event
      const newEvent = {
        id: Date.now().toString(),
        ...eventData,
      };
      
      // Schedule notifications
      const notificationIds = await scheduleNotifications(newEvent);
      newEvent.notificationIds = notificationIds;
      
      updatedEvents = [...events, newEvent];
    }

    // Sort events by date (earliest first)
    updatedEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    setEvents(updatedEvents);
    saveEvents(updatedEvents);
    
    // Reset form and close modal
    resetFormAndCloseModal();
  };

  // Function to delete an event
  const deleteEvent = (id) => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            const eventToDelete = events.find(event => event.id === id);
            
            // Cancel any scheduled notifications for this event
            await cancelEventNotifications(eventToDelete);
            
            const updatedEvents = events.filter(event => event.id !== id);
            setEvents(updatedEvents);
            saveEvents(updatedEvents);
          }
        },
      ]
    );
  };

  // Function to edit an event
  const editEvent = (event) => {
    setEditingEventId(event.id);
    setEventName(event.name);
    setEventDescription(event.description || '');
    setEventDate(new Date(event.date));
    setEventImage(event.image);
    setEventCategory(event.category || 'event');
    setModalVisible(true);
  };

  // Reset form and close modal
  const resetFormAndCloseModal = () => {
    setEventName('');
    setEventDescription('');
    setEventDate(new Date());
    setEventImage(null);
    setEventCategory('event');
    setEditingEventId(null);
    setModalVisible(false);
  };

  // Share event details
  const shareEvent = (event) => {
    const message = `Event: ${event.name}\nDate: ${formatDate(event.date)}\n${event.description ? `Description: ${event.description}` : ''}`;
    
    Share.share({
      message,
      title: 'Event Details',
    });
  };

  // Handler for date picker changes
  const onDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || eventDate;
    setShowDatePicker(Platform.OS === 'ios');
    
    // Preserve the time from the existing date
    if (selectedDate) {
      const newDate = new Date(currentDate);
      newDate.setHours(eventDate.getHours(), eventDate.getMinutes());
      setEventDate(newDate);
    }
  };

  // Handler for time picker changes
  const onTimeChange = (event, selectedTime) => {
    const currentTime = selectedTime || eventDate;
    setShowTimePicker(Platform.OS === 'ios');
    
    // Preserve the date but update the time
    if (selectedTime) {
      const newDate = new Date(eventDate);
      newDate.setHours(currentTime.getHours(), currentTime.getMinutes());
      setEventDate(newDate);
    }
  };

  // Function to format the date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return dayjs(date).format('MMM D, YYYY - h:mm A');
  };

  // Function to calculate time remaining until an event
  const getTimeRemaining = (dateString) => {
    const eventDate = dayjs(dateString);
    const now = dayjs();
    
    const days = eventDate.diff(now, 'day');
    const hours = eventDate.diff(now, 'hour') % 24;
    
    if (days > 0) {
      return `${days}H`;
    } else if (hours > 0) {
      return `${hours}H`;
    } else {
      const minutes = eventDate.diff(now, 'minute') % 60;
      return `${minutes}M`;
    }
  };

  // Filter events based on search query
  const filteredEvents = events.filter(event => 
    event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (event.description && event.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Render an individual event card
  const renderEventCard = ({ item }) => (
    <TouchableOpacity 
      style={[styles.eventCard, { backgroundColor: theme.cardBackground }]}
      onPress={() => editEvent(item)}
      onLongPress={() => deleteEvent(item.id)}
    >
      {item.image && (
        <Image 
          source={{ uri: item.image }} 
          style={styles.eventImage}
          resizeMode="cover"
        />
      )}
      <View style={styles.eventDetails}>
        <View style={styles.eventInfo}>
          <Text style={[styles.eventName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
          <View style={styles.locationContainer}>
            <MaterialIcons name="location-on" size={14} color={isDarkMode ? "#AAAAAA" : "#666"} />
            <Text style={[styles.eventLocation, { color: isDarkMode ? "#AAAAAA" : "#666" }]} numberOfLines={1}>
              {item.description ? item.description.split('\n')[0] : 'No location'}
            </Text>
          </View>
          <View style={[styles.categoryContainer, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F0F0F0' }]}>
            <Text style={[styles.categoryText, { color: isDarkMode ? "#AAAAAA" : "#666" }]}>{item.category || 'Event'}</Text>
          </View>
        </View>
        <View style={styles.timeContainer}>
          <Text style={styles.timeRemainingText}>{getTimeRemaining(item.date)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "light-content"} backgroundColor={theme.headerBackground} />
      
      {/* Curved Header Background */}
      <View style={[styles.headerBackground, { backgroundColor: theme.headerBackground }]}>
        <View style={styles.headerCurve} />
      </View>
      
      {/* App Header */}
      <View style={styles.header}>
        {!isSearchActive ? (
          <>
            <Text style={styles.headerTitle}>What's Up</Text>
            <View style={styles.headerIcons}>
              <TouchableOpacity onPress={() => setIsSearchActive(true)} style={styles.headerIcon}>
                <MaterialIcons name="search" size={24} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSettingsModalVisible(true)} style={styles.headerIcon}>
                <MaterialIcons name="settings" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color={theme.headerBackground} />
            <TextInput
              style={[styles.searchInput, { color: theme.inputText }]}
              placeholder="Search events..."
              placeholderTextColor={theme.placeholderText}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <TouchableOpacity onPress={() => {
              setIsSearchActive(false);
              setSearchQuery('');
            }}>
              <MaterialIcons name="close" size={20} color={theme.headerBackground} />
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {/* Event List */}
      {filteredEvents.length > 0 ? (
        <FlatList
          data={filteredEvents}
          renderItem={renderEventCard}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.eventList, { paddingTop: 30 }]}
        />
      ) : (
        <View style={styles.noEventsContainer}>
          <Text style={[styles.noEventsText, { color: theme.text }]}>No upcoming events</Text>
          <Text style={[styles.noEventsSubText, { color: isDarkMode ? "#AAAAAA" : "#999" }]}>Tap the + button to add an event</Text>
        </View>
      )}
      
      {/* Add Event Button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setModalVisible(true)}
      >
        <MaterialIcons name="add" size={32} color="#FFF" />
      </TouchableOpacity>
      
      {/* Bottom Navigation Tabs */}
      <View style={[styles.bottomNavigation, { backgroundColor: isDarkMode ? "#1E1E1E" : "#FFFFFF", borderTopColor: theme.borderColor }]}>
        {['Home', 'Public', 'Family', 'Expense'].map((tab) => (
          <TouchableOpacity 
            key={tab}
            style={[
              styles.tabButton, 
              activeTab === tab && [styles.activeTabButton, { borderColor: theme.headerBackground }]
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <MaterialIcons 
              name={
                tab === 'Home' ? 'home' :
                tab === 'Public' ? 'public' :
                tab === 'Family' ? 'people' : 'account-balance-wallet'
              } 
              size={24} 
              color={activeTab === tab ? theme.headerBackground : (isDarkMode ? "#777777" : "#AAAAAA")} 
            />
            <Text 
              style={[
                styles.tabText, 
                { color: activeTab === tab ? theme.headerBackground : (isDarkMode ? "#777777" : "#AAAAAA") }
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {/* Add/Edit Event Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={resetFormAndCloseModal}
      >
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
              <Text style={[styles.modalTitle, { color: theme.headerBackground }]}>
                {editingEventId ? 'Edit Event' : 'Add New Event'}
              </Text>
              
              {/* Event Image Picker */}
              <TouchableOpacity 
                style={[styles.imagePicker, { backgroundColor: theme.inputBackground }]} 
                onPress={pickImage}
              >
                {eventImage ? (
                  <Image source={{ uri: eventImage }} style={styles.previewImage} />
                ) : (
                  <View style={styles.imagePickerPlaceholder}>
                    <MaterialIcons name="add-a-photo" size={40} color={isDarkMode ? "#666666" : "#999999"} />
                    <Text style={[styles.imagePickerText, { color: isDarkMode ? "#666666" : "#999999" }]}>Add Event Image</Text>
                  </View>
                )}
              </TouchableOpacity>
              
              {/* Event Name Input */}
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.inputText }]}
                placeholder="Event Name"
                value={eventName}
                onChangeText={setEventName}
                placeholderTextColor={theme.placeholderText}
              />
              
              {/* Event Category Selector */}
              <View style={styles.categorySelector}>
                <Text style={[styles.categoryLabel, { color: theme.text }]}>Category:</Text>
                <View style={styles.categoryButtons}>
                  {['event', 'food', 'sports', 'music', 'other'].map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.categoryButton,
                        { backgroundColor: isDarkMode ? '#333333' : '#F8F8F8' },
                        eventCategory === category && [styles.categoryButtonActive, { backgroundColor: theme.headerBackground }]
                      ]}
                      onPress={() => setEventCategory(category)}
                    >
                      <Text 
                        style={[
                          styles.categoryButtonText,
                          { color: isDarkMode ? '#AAAAAA' : '#666' },
                          eventCategory === category && styles.categoryButtonTextActive
                        ]}
                      >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              {/* Event Description Input */}
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: theme.inputBackground, color: theme.inputText }]}
                placeholder="Location or Description"
                value={eventDescription}
                onChangeText={setEventDescription}
                placeholderTextColor={theme.placeholderText}
                multiline
                numberOfLines={3}
              />
              
              {/* Date Picker Button */}
              <Pressable
                style={[styles.dateTimeButton, { backgroundColor: theme.inputBackground }]}
                onPress={() => setShowDatePicker(true)}
              >
                <MaterialIcons name="calendar-today" size={20} color={theme.headerBackground} style={styles.inputIcon} />
                <Text style={[styles.dateTimeButtonText, { color: theme.inputText }]}>
                  {dayjs(eventDate).format('MMM D, YYYY')}
                </Text>
              </Pressable>
              
              {/* Time Picker Button */}
              <Pressable
                style={[styles.dateTimeButton, { backgroundColor: theme.inputBackground }]}
                onPress={() => setShowTimePicker(true)}
              >
                <MaterialIcons name="access-time" size={20} color={theme.headerBackground} style={styles.inputIcon} />
                <Text style={[styles.dateTimeButtonText, { color: theme.inputText }]}>
                  {dayjs(eventDate).format('h:mm A')}
                </Text>
              </Pressable>
              
              {/* Show Date Picker when needed */}
              {showDatePicker && (
                <DateTimePicker
                  value={eventDate}
                  mode="date"
                  display="default"
                  onChange={onDateChange}
                  minimumDate={new Date()}
                  themeVariant={isDarkMode ? "dark" : "light"}
                />
              )}
              
              {/* Show Time Picker when needed */}
              {showTimePicker && (
                <DateTimePicker
                  value={eventDate}
                  mode="time"
                  display="default"
                  onChange={onTimeChange}
                  themeVariant={isDarkMode ? "dark" : "light"}
                />
              )}
              
              {/* Action Buttons */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={resetFormAndCloseModal}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.button, styles.addEventButton, { backgroundColor: theme.headerBackground }]}
                  onPress={saveEvent}
                >
                  <Text style={styles.buttonText}>
                    {editingEventId ? 'Save Changes' : 'Add Event'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
      
      {/* Settings Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={settingsModalVisible}
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSettingsModalVisible(false)}
        >
          <View 
            style={[
              styles.settingsModalContent, 
              { backgroundColor: theme.cardBackground }
            ]}
          >
            <Text style={[styles.settingsTitle, { color: theme.text }]}>Settings</Text>
            
            <View style={styles.settingItem}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
              <TouchableOpacity 
                style={[
                  styles.toggleContainer, 
                  { backgroundColor: isDarkMode ? theme.headerBackground : '#CCCCCC' }
                ]}
                onPress={toggleTheme}
              >
                <View style={[
                  styles.toggleHandle, 
                  { transform: [{ translateX: isDarkMode ? 20 : 0 }] }
                ]} />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: theme.headerBackground }]}
              onPress={() => setSettingsModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: '#FF4500',
    zIndex: 0,
    overflow: 'hidden',
  },
  headerCurve: {
    position: 'absolute',
    bottom: -50,
    left: 0,
    right: 0,
    height: 100,
    borderRadius: 100,
    backgroundColor: '#FFFFFF',
    transform: [{ scaleX: 1.5 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 10,
    zIndex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  headerIcons: {
    flexDirection: 'row',
  },
  headerIcon: {
    marginLeft: 15,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 20,
    flex: 1,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  eventList: {
    padding: 16,
    paddingTop: 30, // Add extra padding to create overlap effect
  },
  eventCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  eventImage: {
    width: '100%',
    height: 150,
  },
  eventDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  },
  eventInfo: {
    flex: 1,
    marginRight: 10,
  },
  eventName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  locationContainer