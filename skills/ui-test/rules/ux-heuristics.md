# UX Heuristics for AI-Powered UI Testing

These heuristics guide the LLM when evaluating screenshots and page interactions. Five evaluation frameworks targeting SaaS applications, dashboards, and internal tools.

---

## 1. Laws of UX (Behavioral & Cognitive)

### Fitts's Law
**Principle:** The time to reach a target is a function of distance and size.
**What to check:**
- Primary CTAs should be the largest clickable elements in their section
- Destructive actions (delete, cancel) should NOT be larger than constructive ones
- Mobile tap targets must be at least 44x44px (Apple HIG) / 48x48px (Material)
- Navigation items should have generous padding, not just text-sized hit areas
- Form submit buttons should be full-width on mobile
- Frequently used actions should be closer to the user's current focus area

### Hick's Law
**Principle:** Decision time increases with the number and complexity of choices.
**What to check:**
- Navigation menus with more than 7±2 items should be grouped/categorized
- Settings pages with many options should use sections/tabs, not a flat list
- Modals should present one clear action, not multiple competing choices
- Dropdown menus with 15+ items should have search/filter
- Onboarding flows should not present all options at once
- Action menus (right-click, "more" menus) should be organized by frequency of use

### Miller's Law
**Principle:** Working memory holds approximately 7±2 items at once.
**What to check:**
- Long lists should be chunked into groups of 5-9 items
- Phone numbers, credit cards, and codes should be visually grouped
- Dashboards should prioritize 3-5 key metrics, not show everything
- Sidebar navigation should group related items under headings
- Multi-step wizards should show no more than 5-7 steps

### Jakob's Law
**Principle:** Users spend most of their time on OTHER sites and expect yours to work the same way.
**What to check:**
- Login forms should have email/username on top, password below, submit at bottom
- Logo should link to homepage/dashboard
- External links should be visually distinguished or open in new tab
- Back buttons should be top-left
- Search should be in the header area
- Settings gear icon should lead to settings
- User avatar/menu should be top-right
- Sidebar navigation on the left, content on the right

### Aesthetic-Usability Effect
**Principle:** Users perceive aesthetically pleasing designs as more usable.
**What to check:**
- Consistent border radius across all components
- Unified color palette (not more than 3-4 primary colors + neutrals)
- Consistent spacing rhythm (multiples of 4px or 8px)
- Typography hierarchy is clear (headings > subheadings > body > captions)
- Alignment is consistent (left-aligned text, centered headings, etc.)
- No orphaned elements floating without visual grouping

### Doherty Threshold
**Principle:** Productivity soars when system response is <400ms.
**What to check:**
- System response time < 400ms for user actions
- Loading indicators appear for operations > 1 second
- Optimistic UI updates for common actions (toggle, like, save)
- Skeleton screens for content loading, not just spinners
- No full-page reloads for in-page actions

### Von Restorff Effect (Isolation Effect)
**Principle:** Items that stand out from their peers are more memorable.
**What to check:**
- The most important element on each page is visually distinct
- Pricing page highlights the recommended plan
- Error messages stand out from surrounding content
- New/updated features have visual indicators (badges, highlights)
- Primary action is visually differentiated from secondary actions

### Zeigarnik Effect
**Principle:** People remember incomplete tasks better than completed ones.
**What to check:**
- Multi-step forms show progress indicators
- Onboarding flows show completion percentage
- Profile/settings completion is shown if relevant
- Incomplete tasks are visually distinct from complete ones

---

## 2. Nielsen's 10 Usability Heuristics

### H1: Visibility of System Status
**Principle:** The system should always keep users informed about what's going on.
**What to check:**
- Current page/section is highlighted in navigation
- Breadcrumbs show where the user is in the hierarchy
- Form submissions show success/failure feedback
- File uploads show progress bars with percentage
- Background operations show status (syncing, saving, processing)
- Active filters/sorts are visually indicated
- "You are here" indicators exist in multi-step flows
- Timestamps show when data was last updated ("Updated 2 min ago")

### H2: Match Between System and Real World
**Principle:** Use language and concepts familiar to the user, not system-oriented terms.
**What to check:**
- Error messages use plain language, not error codes or stack traces
- Labels use domain terminology the user understands
- Icons match real-world metaphors (trash can for delete, etc.)
- Dates use the user's locale format, not ISO/Unix timestamps
- Numbers use appropriate formatting (commas, currency symbols, abbreviations)
- Status labels are meaningful ("Processing payment" not "State: 3")

### H3: User Control and Freedom
**Principle:** Users need a clearly marked "emergency exit" from unwanted states.
**What to check:**
- Undo is available for destructive actions
- Cancel buttons exist on all forms and modals
- Back navigation works and preserves state
- Multi-step flows allow going back to previous steps
- Bulk selections can be cleared with one click
- Filters can be reset to defaults
- Modal/dialog can be closed via Escape key AND clicking outside

### H4: Consistency and Standards
**Principle:** Users should not have to wonder whether different words, situations, or actions mean the same thing.
**What to check:**
- Same action uses same button style everywhere (primary, secondary, destructive)
- Terminology is consistent (don't mix "delete" and "remove" for the same action)
- Icons mean the same thing across the app
- Date/time formatting is consistent throughout
- Table column behaviors are consistent (all sortable or none)
- Empty states follow the same pattern across different sections
- Error message style is consistent (toast, inline, banner)

### H5: Error Prevention
**Principle:** Even better than good error messages is preventing errors in the first place.
**What to check:**
- Destructive actions require confirmation ("Are you sure you want to delete?")
- Form inputs have appropriate constraints (type=email, maxlength, pattern)
- Disabled states prevent impossible actions (can't submit empty form)
- Dangerous buttons are visually distinct (red) and not adjacent to safe ones
- Unsaved changes trigger a "Leave page?" confirmation
- Auto-save is indicated when available
- Input fields show format hints before the user types (placeholder, helper text)

### H6: Recognition Rather Than Recall
**Principle:** Minimize memory load by making objects, actions, and options visible.
**What to check:**
- Recently used items are shown (recent searches, recent files)
- Form fields show current values, not empty fields requiring user to remember
- Navigation labels are visible, not hidden behind icons only
- Search has autocomplete/suggestions
- Contextual help is available where needed (tooltips, info icons)
- Dashboard widgets show labels, not just numbers

### H7: Flexibility and Efficiency of Use
**Principle:** Accelerators for expert users should not encumber novice users.
**What to check:**
- Keyboard shortcuts exist for power users (and are discoverable)
- Bulk actions are available for repetitive tasks
- Search/filter is available on long lists
- Copy-to-clipboard exists for IDs, keys, URLs
- Quick actions exist (inline edit, single-click actions)
- Default values are sensible and save time

### H8: Aesthetic and Minimalist Design
**Principle:** Every extra unit of information competes with relevant information.
**What to check:**
- No redundant information on the page
- Above-the-fold content is the most important content
- Visual noise is minimized (unnecessary borders, dividers, decorations)
- White space is used to create focus
- Secondary information is accessible but not prominent (expandable sections, tooltips)
- Forms only ask for what's truly needed

### H9: Help Users Recognize, Diagnose, and Recover from Errors
**Principle:** Error messages should be expressed in plain language, indicate the problem, and suggest a solution.
**What to check:**
- Error messages explain WHAT went wrong in plain language
- Error messages suggest HOW to fix it
- Form validation errors appear next to the relevant field, not just at the top
- Error states don't lose the user's input (form data preserved after error)
- Network errors offer a retry option
- 404 pages suggest alternatives (search, navigation, homepage link)
- API errors don't leak technical details to the user (no stack traces, no raw JSON)

### H10: Help and Documentation
**Principle:** Help should be easy to search, focused on the user's task, and concise.
**What to check:**
- Contextual help exists for complex features (tooltips, "?" icons, inline hints)
- Onboarding/tour exists for new users
- Empty states include guidance on what to do next
- Documentation links are accessible from within the app
- Error states link to relevant help articles when appropriate

---

## 3. Error States & Edge Cases

SaaS applications spend 80% of development time on the happy path and 20% on everything else. These checks catch the 80% of user frustration that comes from the "everything else."

### Empty States
**What to check:**
- Every list/table has a designed empty state (not just blank space)
- Empty states explain what this section is for
- Empty states include a CTA to create the first item
- Empty states have an illustration or icon (not just text)
- Search with no results offers suggestions or "try different terms"
- Filtered views with no matches say "No results match your filters" with a clear filter button

### Error Boundaries
**What to check:**
- JavaScript errors don't crash the entire page (error boundary catches them)
- Failed API calls show a meaningful error, not a blank section
- Network disconnection shows an offline indicator
- Timeout errors offer retry
- Authentication expiry redirects to login with a message, doesn't show a broken page
- Partial data load doesn't leave the UI in a half-rendered state

### Form Edge Cases
**What to check:**
- Extremely long text input doesn't break layout (truncation or scroll)
- Special characters in input don't cause errors (quotes, unicode, emoji)
- Pasting content into fields works correctly
- Double-clicking submit doesn't create duplicate entries
- Required field indicators are visible before submission, not just after
- Tab order through form fields follows visual order
- Date pickers handle timezone edge cases
- Number inputs handle negative numbers, decimals, and zero

### Loading States
**What to check:**
- Initial page load has skeleton screens or loading indicators
- Data refresh shows subtle loading indicator (not full-page spinner)
- Long-running operations show progress (not just a spinner)
- Stale data is indicated ("Last updated 5 min ago" or visual dimming)
- Optimistic updates revert gracefully if the server rejects them
- Infinite scroll has a loading indicator at the bottom
- Image loading uses blur-up, skeleton, or placeholder

### Permission & Auth Edge Cases
**What to check:**
- Unauthorized access shows a meaningful message, not a 403 page
- Expired session redirects to login and returns user to where they were
- Role-based UI hides actions the user can't perform (not just disables them)
- Shared links work for users with appropriate permissions
- "Access denied" messages suggest who to contact for access

---

## 4. Data Display Heuristics

SaaS apps are data-heavy. Tables, charts, dashboards, and lists are where users spend most of their time. These are the most common sources of visual bugs and usability issues.

### Tables
**What to check:**
- Column headers are clear and concise
- Columns are appropriately sized (not all equal width)
- Long cell content is truncated with tooltip/expand, not overflowing
- Numeric columns are right-aligned
- Text columns are left-aligned
- Row hover state exists for visual tracking
- Sortable columns are indicated (sort icon)
- Active sort direction is shown (ascending/descending)
- Empty table has a designed empty state
- Pagination shows total count and current range ("Showing 1-25 of 142")
- Table is keyboard navigable
- On mobile: table scrolls horizontally OR transforms to card layout

### Charts & Graphs
**What to check:**
- Charts have clear titles and axis labels
- Legend is visible and matches chart colors
- Tooltips show exact values on hover
- Zero-data state shows a message, not an empty chart
- Color palette is accessible (not relying solely on color to distinguish series)
- Y-axis starts at zero for bar charts (unless there's a clear reason not to)
- Time-series x-axis has appropriate intervals
- Charts are responsive (don't overflow on small screens)

### Dashboard Metrics
**What to check:**
- Key metrics have labels, values, AND context (trend, comparison period)
- Large numbers use appropriate formatting (1.2K not 1200, $1.5M not $1500000)
- Percentage changes show direction (up/down arrow or color)
- Metrics refresh is indicated (timestamp or refresh button)
- Metric cards have consistent sizing and alignment
- Too many metrics create cognitive overload — prioritize 3-5 key ones

### Filters & Search
**What to check:**
- Active filters are visible and individually removable
- "Clear all filters" button exists when any filter is active
- Filter state persists across page navigation
- Search is responsive (results appear as you type, or after Enter)
- Search handles empty query gracefully
- Filter combinations that yield no results show a helpful message
- Date range filters validate that start < end

### Pagination & Infinite Scroll
**What to check:**
- Total item count is shown
- Current page/position is indicated
- Page size selector exists for tables
- URL updates with page state (shareable/bookmarkable)
- Navigating back preserves scroll position and page
- Infinite scroll has a clear "end of list" indicator
- Loading more items doesn't jump the scroll position

### Numbers, Dates & Formatting
**What to check:**
- Dates use consistent format throughout the app
- Relative dates where appropriate ("3 hours ago" vs "2026-03-24T16:30:00Z")
- Currency values show appropriate symbol and decimal places
- Large numbers are abbreviated consistently (K, M, B)
- Percentages show appropriate precision (don't show 33.333333%)
- Duration formatting is human-readable ("2h 15m" not "135 minutes" or "8100000ms")
- Null/undefined values show a dash or "N/A", not "null" or "undefined" or blank

---

## 5. Visual Design Checks

### Typography
- Body text: 16px minimum on desktop, 14px minimum on mobile
- Line height: 1.4-1.6 for body text
- Heading scale: clear size difference between h1 → h2 → h3
- Maximum line length: 60-80 characters for readability
- No more than 2-3 font families on a page
- Font weight variation is intentional and consistent
- Monospace font used for code, IDs, and technical values

### Color & Contrast
- WCAG AA: 4.5:1 contrast ratio for normal text
- WCAG AA: 3:1 contrast ratio for large text (18px+ or 14px+ bold)
- Interactive elements have distinct hover/active/focus states
- Error states use red (or culturally appropriate warning color)
- Success states use green
- Warning states use yellow/amber
- Info states use blue
- Disabled states are visually muted but still readable
- Status colors are consistent throughout the app (same green = same meaning)

### Spacing & Layout
- Consistent gutters between grid columns
- Section spacing follows a predictable rhythm
- Related items are closer together than unrelated items (proximity principle)
- Whitespace is intentional, not accidental
- No content touches the edge of the viewport without padding
- Cards/containers have consistent internal padding
- Sidebar width is appropriate (not too narrow to read, not too wide eating content)

### Interactive Elements
- All buttons have visible hover states
- All links are distinguishable from regular text
- Form inputs have clear focus states (not just browser default outline)
- Disabled elements look disabled (muted, no pointer cursor)
- Loading buttons show a spinner and prevent double-click
- Toggle/switch states are clearly on vs off
- Dropdown indicators (chevron) point in the correct direction (down when closed, up when open)
- Destructive buttons are visually distinct (red or outlined, not primary style)

---

## 6. Accessibility Checks

### Keyboard Navigation
- All interactive elements reachable via Tab
- Tab order follows visual order (top-to-bottom, left-to-right)
- Focus is visible on all elements (not just browser default — custom focus ring)
- Escape closes modals/dropdowns
- Enter/Space activates buttons
- Arrow keys navigate within component groups (tabs, menus, radio groups)
- Skip-to-content link exists for screen reader users
- Focus is trapped inside open modals (can't Tab to elements behind the modal)
- Focus returns to trigger element when modal closes

### Screen Reader
- All images have alt text (or aria-hidden if decorative)
- Form inputs have associated labels (not just placeholder text)
- Headings are hierarchical (no skipping from h1 to h4)
- Landmark regions exist (nav, main, aside, footer)
- Live regions announce dynamic content updates (toast notifications, loading states)
- Modals trap focus and announce their title
- Tables have proper th/td structure and scope attributes
- Custom components (tabs, accordions, dropdowns) have correct ARIA roles

### Motion & Reduced Motion
- Respects `prefers-reduced-motion` media query
- No auto-playing animations that can't be paused
- No flashing content (3 flashes per second max)
- Parallax/scroll-triggered animations have alternatives
- Loading spinners are simple (no complex animations)

### Color Independence
- Information is never conveyed by color alone
- Error states have icons AND color (not just red text)
- Charts use patterns/shapes in addition to color
- Status indicators have text labels alongside color dots
- Form validation shows icons (checkmark, X) not just green/red borders
