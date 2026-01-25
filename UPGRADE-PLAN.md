# My Workout Tracker - Upgrade Plan

**Focus:** Mobile-first fitness companion - not just workout tracking, but a complete lifestyle tool for achieving fitness goals. Track workouts, nutrition, body weight, and progress all in one beautiful, easy-to-use app.

**Philosophy:** Help users reach their goals by connecting the dots between training, nutrition, and body composition. Make daily logging effortless.

---

## Phase 0: Technical Foundation ✅ COMPLETE

Code cleanup, modularization, and infrastructure improvements. Codebase now has:
- Modular architecture with extracted components
- Robust error handling and validation
- Comprehensive test infrastructure (315+ tests)
- Rate limiting and performance optimizations

---

## Phase 0.5: Firebase Optimization (CRITICAL - BEFORE PHASE 1)

**Problem:** Currently hitting ~10k Firebase reads per day with single user - excessive and costly.

**Goal:** Reduce Firebase reads/writes by 80-90% through aggressive caching and smart data fetching strategies.

**Effort:** 1-2 weeks  
**Priority:** CRITICAL - Must do before adding more features that increase data load

### Immediate Optimizations

#### 1. Local-First Architecture
- [ ] **IndexedDB Cache Layer**: 
  - Store all user data locally in IndexedDB
  - Firestore becomes backup/sync only, not primary data source
  - Read from local cache first, Firebase second
  - Implement cache invalidation strategy (TTL-based)

- [ ] **Smart Sync Strategy**:
  - Only sync on app startup (once per session)
  - Sync on explicit user action (pull-to-refresh)
  - Background sync every 5-10 minutes (not every action)
  - Batch all writes and sync together

#### 2. Query Optimization
- [ ] **Eliminate Real-Time Listeners**:
  - Remove `onSnapshot()` listeners (each triggers multiple reads)
  - Use one-time `get()` calls instead
  - Only fetch data when explicitly needed
  - Consider WebSockets for critical real-time needs only

- [ ] **Pagination & Lazy Loading**:
  - Load workout history in pages (10-20 sessions at a time)
  - Infinite scroll for history view
  - Don't load full exercise list on startup (cache it)
  - Load statistics on-demand, not automatically

- [ ] **Query Consolidation**:
  - Combine multiple small queries into fewer large ones
  - Use composite indexes for complex queries
  - Denormalize data where appropriate (trade writes for reads)

#### 3. Write Optimization
- [ ] **Batch Writes**:
  - Queue all writes during workout session
  - Commit all changes in single batch on session end
  - Reduce individual set updates (save full workout at once)
  - Use transactions for related updates

- [ ] **Debounced Auto-Save**:
  - Don't save on every set completion
  - Debounce auto-save to every 30-60 seconds
  - Keep local state in memory during workout
  - Save to IndexedDB immediately, Firestore periodically

#### 4. Data Structure Optimization
- [ ] **Flat Data Structure**:
  - Avoid nested collections where possible
  - Minimize document size (smaller = fewer read units)
  - Split large documents into smaller ones
  - Use subcollections only when necessary

- [ ] **Selective Field Updates**:
  - Use `update()` with specific fields, not full document writes
  - Only sync changed fields, not entire documents
  - Implement change detection before writes

#### 5. Static Data Caching
- [ ] **Exercise Database**:
  - Cache exercise list in IndexedDB indefinitely
  - Only fetch from Firestore on version mismatch
  - Store version number to detect updates
  - Reduce from ~100 reads/day to ~1 read/month

- [ ] **User Preferences**:
  - Load once per session, cache in memory
  - Don't re-fetch on every view change
  - Update local cache on preference changes

#### 6. Monitoring & Analytics
- [ ] **Firebase Usage Dashboard**:
  - Track reads/writes per session
  - Log expensive queries
  - Alert when daily limit approaches
  - A/B test optimization strategies

- [ ] **Performance Metrics**:
  - Measure cache hit rate (target >90%)
  - Track sync frequency
  - Monitor IndexedDB size
  - Report slow queries

### Implementation Strategy

```javascript
// New: CacheManager with IndexedDB
class FirebaseCacheManager {
  constructor() {
    this.db = null; // IndexedDB instance
    this.syncQueue = [];
    this.lastSync = null;
  }

  // Read: Cache-first strategy
  async getData(collection, docId) {
    // 1. Try IndexedDB first
    const cached = await this.getFromCache(collection, docId);
    if (cached && !this.isStale(cached)) {
      return cached.data;
    }

    // 2. Fetch from Firestore only if cache miss/stale
    const fresh = await this.fetchFromFirestore(collection, docId);
    await this.updateCache(collection, docId, fresh);
    return fresh;
  }

  // Write: Queue and batch
  async saveData(collection, docId, data) {
    // 1. Save to IndexedDB immediately (fast)
    await this.updateCache(collection, docId, data);

    // 2. Queue for Firestore sync
    this.syncQueue.push({ collection, docId, data });

    // 3. Debounced sync
    this.scheduleSync();
  }

  // Batch sync queued writes
  async syncToFirestore() {
    if (this.syncQueue.length === 0) return;

    const batch = db.batch();
    for (const item of this.syncQueue) {
      const ref = db.collection(item.collection).doc(item.docId);
      batch.set(ref, item.data, { merge: true });
    }

    await batch.commit();
    this.syncQueue = [];
    this.lastSync = Date.now();
  }

  // Only sync every 5 minutes or on explicit trigger
  scheduleSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.syncToFirestore(), 5 * 60 * 1000);
  }
}

// New: Workout session with batched saves
class OptimizedWorkoutSession {
  constructor() {
    this.exercises = [];
    this.isDirty = false;
    this.lastSave = Date.now();
  }

  // Add set - only saves locally
  addSet(exerciseId, weight, reps) {
    this.exercises.find(e => e.id === exerciseId).sets.push({ weight, reps });
    this.isDirty = true;
    
    // Save to IndexedDB immediately
    cacheManager.saveToLocal('activeSession', this.toJSON());
    
    // Debounced Firestore sync (not on every set)
    this.debouncedSave();
  }

  // Only save to Firestore every 60 seconds or on finish
  debouncedSave = debounce(() => {
    if (this.isDirty) {
      cacheManager.saveData('sessions', this.id, this.toJSON());
      this.isDirty = false;
    }
  }, 60000); // 60 seconds

  // Force save on session finish
  async finish() {
    await cacheManager.saveData('sessions', this.id, this.toJSON());
    await cacheManager.syncToFirestore(); // Force immediate sync
  }
}
```

### Expected Results

**Current Usage (per day, single user):**
- Reads: ~10,000 (EXCESSIVE)
- Writes: ~2,000
- Cost: ~$0.60/day = ~$18/month 💸

**After Optimization (target):**
- Reads: ~500-1,000 (90% reduction) ✅
- Writes: ~200-400 (80% reduction) ✅
- Cost: ~$0.03-0.06/day = ~$1-2/month 💰

**Key Improvements:**
- Exercise list: 100 reads/day → 1 read/month
- User profile: 50 reads/day → 1 read/session
- Workout history: 5000 reads/day → 100 reads/day (pagination)
- Active session: 1000 writes/day → 1-2 writes/session (batching)
- Progress stats: 4000 reads/day → cache-based (0 reads)

### Testing

- [ ] Create Firebase usage monitoring dashboard
- [ ] Test with realistic workout patterns (5 exercises, 15 sets)
- [ ] Verify cache invalidation works correctly
- [ ] Test offline mode with sync on reconnect
- [ ] Ensure data consistency across devices
- [ ] Load test with 30-day workout history
- [ ] Maintain >80% test coverage for caching layer

---

## Phase 1: Mobile-First UX Overhaul (AFTER Firebase Optimization)

**Goal:** Transform the app into a complete fitness companion. Make it incredibly easy to track workouts, nutrition, weight, and goals on mobile. Focus on speed, clarity, and delightful interactions.

**Mobile Focus:** Thumb-friendly controls, minimal typing, quick actions, clear visuals. Daily check-ins should take < 30 seconds.

**Effort:** 4-5 weeks  
**Risk:** Low - UI improvements, no complex backend changes

### Daily Dashboard (New Home Screen)
- [ ] **Today's Overview**: Quick glance at today's progress
  - Current weight and trend (↑↓)
  - Calories logged vs goal
  - Workout status (completed/planned/rest day)
  - Active streak counter
- [ ] **Quick Actions**: Large buttons for common tasks
  - Log Weight (single tap → number pad → done)
  - Log Calories (quick entry or meal-based)
  - Start Workout (muscle group or routine)
  - View Progress (charts and trends)
- [ ] **Goal Progress**: Visual indicators for weekly/monthly goals
  - Weight goal progress bar
  - Weekly workout target (e.g., 4/5 workouts done)
  - Calorie consistency streak

### Nutrition Tracking
- [ ] **Daily Calorie Logging**: 
  - Quick number entry for total daily calories
  - Optional: Simple meal logging (breakfast, lunch, dinner, snacks)
  - Photo logging for meals (optional)
  - Running total throughout day
- [ ] **Calorie Goals**:
  - Set based on user objective (cut/maintain/bulk)
  - Automatic TDEE calculator (age, weight, height, activity level)
  - Visual feedback (green when on target, red when off)
- [ ] **Macro Tracking** (Optional advanced feature):
  - Protein/carbs/fats breakdown
  - Simple percentage-based approach
  - Focus on protein for strength training

### Body Weight Management
- [ ] **Daily Weight Logging**: 
  - Morning weight entry (recommended time reminder)
  - Multiple entries per day (show average)
  - Notes field (hydration, time of day, etc.)
- [ ] **Weight Goal System**:
  - Set target weight and deadline
  - Track progress with visual indicators
  - Smart projections based on current rate
  - Celebrate milestones (every 2kg, halfway point, etc.)
- [ ] **Weight Graph**:
  - Beautiful line chart with trend line
  - Weekly/monthly averages to smooth fluctuations
  - Annotations for important events
  - Export/share weight progress

### Goal Setting & Tracking
- [ ] **Multiple Goal Types**:
  - Body weight goals (lose 5kg, gain 10kg)
  - Strength goals (bench press 100kg)
  - Habit goals (workout 4x/week)
  - Nutrition goals (hit protein target daily)
- [ ] **Goal Dashboard**:
  - Progress bars for each active goal
  - Time remaining to deadline
  - Suggested actions to stay on track
- [ ] **Smart Reminders**:
  - Daily check-in notifications
  - Missed workout reminders
  - Weekly progress summaries

### Quick Start Workout Mode
- [ ] **Muscle Group Selection**: Large, tappable buttons for muscle groups (Chest, Back, Legs, Shoulders, Arms, Core)
- [ ] **Recent Exercises**: Show frequently used exercises for selected muscle group
- [ ] **One-Tap Exercise Adding**: Add exercises to session with single tap
- [ ] **Smart Exercise Search**: Fast, fuzzy search with recent history prioritized
- [ ] **Flexible Session Building**: Build workout on-the-fly without pre-planning

### Enhanced Session Experience
- [ ] **Improved Set Input**: Large number pad for weight/reps entry
- [ ] **Quick Copy Previous Set**: One-tap to copy last set's weight/reps
- [ ] **Swipe to Delete**: Swipe sets/exercises to remove them
- [ ] **Visual Progress**: Show current session volume and duration
- [ ] **Rest Timer Improvements**: 
  - Auto-start after completing set
  - Customizable default times per exercise type
  - Notifications when rest is complete
  - Skip/extend with simple buttons

### Mobile UI Enhancements
- [ ] **Bottom Sheet Navigation**: Slide-up panels for actions (better than modals)
- [ ] **Haptic Feedback**: Subtle vibrations for important actions
- [ ] **Smooth Animations**: Polished transitions between screens
- [ ] **Dark Mode Polish**: Ensure dark mode is perfect for gym lighting
- [ ] **One-Handed Mode**: All critical actions accessible with thumb
- [ ] **Loading States**: Skeleton screens instead of spinners
- [ ] **Error States**: Friendly, actionable error messages

### Workout Templates
- [ ] **Quick Templates**: Save favorite workout combinations
- [ ] **Template Library**: Pre-built templates (Push/Pull/Legs, Upper/Lower, etc.)
- [ ] **One-Tap Start**: Start workout from template immediately
- [ ] **Template Editing**: Modify templates inline during workout

---

## Phase 2: Complete Progress Analytics (After Phase 1)

**Goal:** Connect all the dots between training, nutrition, and body composition. Show users how their daily actions drive results.

**Mobile Focus:** Simple, clear charts that tell a story at a glance. Insights that motivate and guide.

**Effort:** 3-4 weeks

### Integrated Progress Dashboard
- [ ] **Personal Records**: Highlight new PRs with celebration animations
- [ ] **Muscle Group Distribution**: Visual breakdown of training frequency
- [ ] **Volume Trends**: Weekly/monthly volume charts by muscle group
- [ ] **Workout Streak**: Gamified streak counter with milestones
- [ ] **Calendar Heatmap**: GitHub-style contribution calendar for workouts

### Exercise History
- [ ] **Exercise-Specific Progress**: View strength progression per exercise
- [ ] **Volume Over Time**: Track total volume (sets × reps × weight)
- [ ] **Best Sets**: Quick view of personal bests
- [ ] **Graphs**: Line charts showing progression over weeks/months

---

## Phase 3: Smart Insights & Automation (After Phase 2)

**Goal:** Provide intelligent, rule-based insights that help users reach their goals faster. Connect training, nutrition, and body composition data.

**Mobile Focus:** Automatic insights that require no extra effort from users. Actionable notifications.

**Effort:** 3-4 weeks

### Automatic Insights (Cross-Domain)
- [ ] **Goal Trajectory**: "At this rate, you'll reach 75kg by March 15"
- [ ] **Nutrition Alignment**: "Your calories are too low for muscle gain - increase by 200"
- [ ] **Training Optimization**: "You're strongest on 2800+ calorie days"
- [ ] **Recovery Intelligence**: "Heavy volume last week + low calories = consider rest day"
- [ ] **Plateau Breaking**: "No strength gains in 3 weeks - try increasing calories or decreasing volume"
- [ ] **Training Balance**: Detect under-trained muscle groups
- [ ] **Consistency Rewards**: Celebrate streaks (7, 14, 30 days of logging)
- [ ] **Milestone Celebrations**: Major achievements (weight goals, PR milestones, workout counts)

### Exercise Database Enhancements
- [ ] **Exercise Categories**: Better organization (Compound, Isolation, Cardio)
- [ ] **Muscle Group Tagging**: Multi-muscle exercises properly tagged
- [ ] **Equipment Filtering**: Filter exercises by available equipment
- [ ] **Exercise Notes**: Add personal notes to exercises (form cues, preferences)
- [ ] **Favorite Exercises**: Star frequently used exercises

### Workout History Improvements
- [ ] **Advanced Filtering**: Filter by muscle group, date range, duration
- [ ] **Session Comparison**: Compare two workout sessions side-by-side
- [ ] **Notes and Tags**: Add session notes and custom tags
- [ ] **Share Workouts**: Generate shareable workout summaries (text/image)

---

## Phase 4: Community & Social (Future)

**Goal:** Add optional social features for users who want them.

**Effort:** Ongoing

- [ ] **Workout Sharing**: Share session summaries with friends
- [ ] **Friend Following**: See friends' workouts (privacy-controlled)
- [ ] **Challenges**: Create and join workout challenges
- [ ] **Leaderboards**: Opt-in community leaderboards

---

## Implementation Priority

| Phase | Priority | Effort | Start |
|-------|----------|--------|-------|
| **Phase 0.5: Firebase Optimization** | **CRITICAL FIRST** 🔥💰 | 1-2 weeks | THIS WEEK |
| **Phase 1: UX + Lifestyle** | **CRITICAL NOW** 🎨📊 | 4-5 weeks | After Phase 0.5 |
| Phase 2: Complete Analytics | HIGH | 3-4 weeks | After Phase 1 |
| Phase 3: Smart Insights | Medium | 3-4 weeks | After Phase 2 |
| Phase 4: Social | Low | Ongoing | After Phase 3 |

**Key Insight:** Firebase optimization MUST come before new features because:
1. **Cost prevention** - 10k reads/day = $18/month for ONE user (unsustainable)
2. **Foundation for scaling** - Adding lifestyle features will 3x data load without optimization
3. **Performance** - Local-first = instant app, better UX
4. **Offline support** - Proper caching enables true offline functionality

Then, complete lifestyle tracking because:
5. **Fitness is holistic** - Training alone doesn't show the full picture
6. **Users need daily value** - Daily weight/calorie logging = daily app usage
7. **Data drives results** - More data = better insights = faster goal achievement
8. **Competitive advantage** - Integrated + fast + affordable

---

## Getting Started (Next Steps)

### THIS WEEK: Phase 0.5 - Firebase Optimization (CRITICAL)

**Day 1-2: Setup & Monitoring** (Foundation)
1. [ ] Implement Firebase usage tracking
   - Add read/write counters to all Firestore calls
   - Create usage dashboard (log to console for now)
   - Identify hottest paths (what's causing 10k reads?)
   - Document current usage patterns

2. [ ] Setup IndexedDB infrastructure
   - Install/implement IndexedDB wrapper (e.g., idb library)
   - Design cache schema matching Firestore structure
   - Create CacheManager class
   - Write tests for cache operations

**Day 3-5: Implement Caching Layer**
1. [ ] Exercise database caching
   - Load exercises once, cache in IndexedDB
   - Add version checking mechanism
   - Update exercise-cache.js to use IndexedDB
   - Test cache hit rates

2. [ ] User data caching
   - Cache user profile on login (1 read/session)
   - Cache preferences in memory
   - Cache routines list
   - Only fetch on explicit refresh

3. [ ] Workout history pagination
   - Implement lazy loading (10 sessions at a time)
   - Cache loaded sessions
   - Infinite scroll on history view
   - Reduce from full history load to paginated

**Day 6-8: Batch Writes & Testing**
1. [ ] Implement workout session batching
   - Save to IndexedDB on every set (instant)
   - Queue Firestore writes
   - Batch commit on session end
   - Debounced auto-save (every 60s)

2. [ ] Remove real-time listeners
   - Replace onSnapshot with get() calls
   - Only listen to critical data (none for now)
   - Test offline functionality

3. [ ] Test & validate
   - Monitor Firebase usage with new implementation
   - Target: <1000 reads per day
   - Verify cache consistency
   - Test offline → online sync

**Day 9-10: Polish & Document**
1. [ ] Edge case handling
   - Cache invalidation on errors
   - Handle quota exceeded
   - Sync conflict resolution

2. [ ] Update tests
   - Unit tests for CacheManager
   - Integration tests for sync logic
   - Maintain >80% coverage

3. [ ] Document usage
   - Add comments to caching strategy
   - Update architecture docs
   - Create migration guide

---

### Week 2-3: Daily Dashboard & Core Lifestyle Features (After Optimization)
1. **UI Design** (2 days)
   - [ ] Design new dashboard home screen
   - [ ] Design quick weight/calorie logging flows
   - [ ] Design goal setting interface
   - [ ] Sketch bottom sheet layouts for all quick actions
   
2. **Implementation** (3 days)
   - [ ] Build daily dashboard UI
   - [ ] Implement quick weight logging (number pad component)
   - [ ] Implement calorie logging interface
   - [ ] Add goal progress indicators
   - [ ] Write tests for new components

### Week 2: Lifestyle Tracking Integration
1. **Database Schema** (1 day)
   - [ ] Create dailyLogs collection in Firestore
   - [ ] Update user profile schema for goals
   - [ ] Add nutrition and weight fields
   
2. **Data Visualization** (2 days)
   - [ ] Build weight graph component
   - [ ] Build calorie trends chart
   - [ ] Implement goal progress visualization
   
3. **Testing** (2 days)
   - [ ] Write unit tests for logging features
   - [ ] Write tests for goal calculations
   - [ ] Manual mobile testing
   - [ ] Test data sync across devices
### Week 3: Workout Experience Polish
1. **Quick Start Mode** (2 days)
   - [ ] Build muscle group selector UI
   - [ ] Implement exercise search
   - [ ] Add recent exercises feature
   
2. **Set Input Improvements** (2 days)
   - [ ] Reuse number pad component from weight logging
   - [ ] Implement "copy previous set" button
   - [ ] Add swipe-to-delete gesture
   
3. **Rest Timer Enhancements** (1 day)
   - [ ] Auto-start timer after set
   - [ ] Customizable defaults
   - [ ] Better timer UI with progress ring

### Week 4-5: Mobile UI Polish & Integration
1. **Visual Improvements** (3 days)
   - [ ] Implement bottom sheet navigation
   - [ ] Add smooth animations throughout
   - [ ] Polish dark mode for all new screens
   - [ ] Add haptic feedback for all actions
   - [ ] Loading states for all async operations
   
2. **Cross-Feature Integration** (2 days)
   - [ ] Link workout energy to sleep/nutrition data
   - [ ] Show today's calories on workout screen
   - [ ] Suggest workouts based on calorie intake
   - [ ] Update dashboard after workout completion
   
3. **Performance & QA** (3 days)
   - [ ] Add skeleton screens everywhere
   - [ ] Optimize rendering and data fetching
   - [ ] Test on slower devices
   - [ ] Comprehensive mobile testing
   - [ ] Fix edge cases
   - [ ] Ensure >80% test coverage

---

## Phase 1.5: Workout Templates & Flexibility (Parallel)

**Goal:** Give users workout flexibility while maintaining simplicity. Mobile-first design throughout.

**Effort:** 1-2 weeks (lightweight, can run in parallel)
### Week 3: Workout Experience Polish
1. **Quick Start Mode** (2 days)
   - [ ] Build muscle group selector UI
   - [ ] Implement exercise search
   - [ ] Add recent exercises feature
   
2. **Set Input Improvements** (2 days)
   - [ ] Reuse number pad component from weight logging
   - [ ] Implement "copy previous set" button
   - [ ] Add swipe-to-delete gesture
   
3. **Rest Timer Enhancements** (1 day)
   - [ ] Auto-start timer after set
   - [ ] Customizable defaults
   - [ ] Better timer UI with progress ring

### Week 4-5: Mobile UI Polish & Integration
1. **Visual Improvements** (3 days)
   - [ ] Implement bottom sheet navigation
   - [ ] Add smooth animations throughout
   - [ ] Polish dark mode for all new screens
   - [ ] Add haptic feedback for all actions
   - [ ] Loading states for all async operations
   
2. **Cross-Feature Integration** (2 days)
   - [ ] Link workout energy to sleep/nutrition data
   - [ ] Show today's calories on workout screen
   - [ ] Suggest workouts based on calorie intake
   - [ ] Update dashboard after workout completion
   
3. **Performance & QA** (3 days)
   - [ ] Add skeleton screens everywhere
   - [ ] Optimize rendering and data fetching
   - [ ] Test on slower devices
   - [ ] Comprehensive mobile testing
   - [ ] Fix edge cases
   - [ ] Ensure >80% test coverage

---

## Why This Order?

**FIRST: Firebase Optimization**

Without this, the app is unsustainable:
- Currently: 10,000 reads/day with 1 user = $18/month
- With lifestyle features: Could hit 30,000 reads/day = $54/month 💸
- After optimization: <1,000 reads/day = $2/month ✅

Adding features BEFORE optimization would be building on a broken foundation.

**THEN: Complete Lifestyle Tracking**

**Core Philosophy:** Fitness success requires consistency in THREE areas: training, nutrition, and tracking progress. An app that makes all three easy wins.

**Mobile Reality:** Users need the app:
- **At the gym** - Quick workout logging with sweaty hands
- **In the morning** - Log weight before breakfast (30 seconds)
- **Throughout the day** - Track calories after meals
- **Before bed** - Review daily progress

Making ALL these moments delightful = daily app usage = better results.

**Our Advantage:** 
- Most workout apps ignore nutrition
- Most nutrition apps ignore training
- Most ignore the connection between them
- We integrate everything beautifully in a mobile-first experience

---

## Technical Approach

### Database Updates
```javascript
// Add to session document
{
  muscleGroups: ["chest", "shoulders"],        // NEW - for filtering
  sessionType: "quick-start" | "routine" | "template",  // NEW
  duration: 3600,                              // NEW - total time
  totalVolume: 12500,                          // NEW - kg × reps × sets
  userEnergy: "high" | "normal" | "low",      // NEW - optional mood/energy tracking
}

// Add user profile (expanded for lifestyle tracking)
{
  userId: "user123",
  
  // Body composition
  currentWeight: 75.5,
  targetWeight: 80,
  height: 175,                                 // cm
  age: 28,
  gender: "male",
  
  // Goals
  primaryGoal: "muscle-gain" | "fat-loss" | "recomp" | "maintenance" | "strength",
  targetDate: "2026-06-01",                   // When to reach goal
  secondaryGoals: [                            // Multiple concurrent goals
    { type: "strength", exercise: "bench-press", target: 100, unit: "kg" },
    { type: "habit", description: "Train 4x/week", target: 4 }
  ],
  
  // Nutrition
  calorieGoal: 2800,
  proteinGoal: 150,                            // grams
  trackMacros: true,                           // Enable macro tracking
  
  // Preferences
  favoriteExercises: ["bench-press", "squat"],
  defaultRestTimes: {
    compound: 180,
    isolation: 90,
    cardio: 60
  },
  
  // Tracking preferences
  reminderTime: "09:00",                       // Daily check-in reminder
  weeklyGoal: 4,                               // Workouts per week
}

// New: Daily Log Collection
{
  userId: "user123",
  date: "2026-01-25",
  
  // Weight
  weight: 75.5,
  weightTime: "08:30",                         // Time of measurement
  weightNotes: "After morning bathroom",
  
  // Nutrition
  calories: 2650,
  protein: 145,
  carbs: 320,
  fats: 85,
  meals: [                                     // Optional detailed tracking
    { name: "Breakfast", calories: 650, protein: 35, time: "08:00" },
    { name: "Lunch", calories: 800, protein: 45, time: "13:00" },
    // ...
  ],
  
  // Daily notes
  energyLevel: "high" | "normal" | "low",
  sleepQuality: 8,                             // 1-10 scale
  notes: "Felt strong today",
  
  // References
  workoutSessionId: "session123",              // Link to workout if trained today
}
```

### UI Component Examples

#### Bottom Sheet Pattern
```javascript
// Bottom sheets slide up from bottom (better than center modals on mobile)
const showExerciseSelector = () => {
  const sheet = new BottomSheet({
    content: exerciseSelectorContent,
    height: '85%',
    onClose: handleClose
  });
  sheet.show();
};
```

#### Haptic Feedback
```javascript
// Subtle vibrations for important actions
const provideFeedback = (type = 'light') => {
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      success: [10, 50, 10]
    };
    navigator.vibrate(patterns[type]);
  }
};
```

---

## Success Metrics

After Phase 1:
- **Daily Engagement**: Users open app daily (not just workout days)
- **Quick Logging**: Weight logging < 15 seconds, calorie logging < 30 seconds
- **Workout Speed**: Time to start workout < 10 seconds
- **One-Handed Usage**: User can log workout, weight, and calories one-handed
- **Retention**: Week-over-week retention > 80%
- **Data Completeness**: >70% of users log weight AND calories regularly

After Phase 2:
- **Insight Value**: Users check progress dashboard 3+ times per week
- **Correlation Discovery**: Users discover personal patterns (e.g., "I lift more on high-calorie days")
- **Goal Achievement**: Users hitting weight goals within projected timeframe
- **Visual Engagement**: Calendar heatmap completion motivates daily logging

After Phase 3:
- **Autonomous Insights**: Users act on automatic suggestions (increase calories, add rest day, etc.)
- **Plateau Resolution**: Users successfully break through plateaus using insights
- **Behavior Change**: Users balance training better across muscle groups
- **Long-term Success**: Users reach and maintain fitness goals

---

## Testing Strategy

All new features must maintain our test coverage standards:

- **Unit Tests**: Test all new components in isolation
- **Integration Tests**: Test complete workflows (start workout → log sets → finish)
- **Manual Tests**: Test on actual mobile devices (iOS/Android)
- **Coverage Goal**: Maintain >80% coverage throughout development

Use existing test infrastructure:
- `npm test` - Run all automated tests
- `npm run test:coverage` - Check coverage reports
- `npm run serve` - Manual testing in browser

---

*Last Updated: January 25, 2026*
