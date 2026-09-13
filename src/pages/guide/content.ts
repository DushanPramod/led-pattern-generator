/**
 * The user guide, in every language it is offered in.
 *
 * Text may use two bits of inline markup, rendered by GuidePage:
 *   **Label**  a control exactly as the app names it (kept in English in every
 *              language, so it can be found on screen)
 *   `code`     a file name, pin, value or piece of the sketch
 */

export type Lang = 'en' | 'si'
export type Text = Record<Lang, string>

export type GuideItem = { label: Text; body: Text }

export type GuideSection = {
  id: string
  title: Text
  intro?: Text
  steps?: Text[]
  items?: GuideItem[]
  note?: Text
}

export const LANGS: Array<{ id: Lang; label: string; htmlLang: string }> = [
  { id: 'en', label: 'English', htmlLang: 'en' },
  { id: 'si', label: 'සිංහල', htmlLang: 'si' },
]

export const UI: Record<string, Text> = {
  title: { en: 'User guide', si: 'පරිශීලක මාර්ගෝපදේශය' },
  subtitle: {
    en: 'every screen and option, explained',
    si: 'සෑම තිරයක්ම සහ විකල්පයක්ම පැහැදිලි කෙරේ',
  },
  contents: { en: 'Contents', si: 'පටුන' },
  labelsNote: {
    en: 'Button and field names are written exactly as they appear in the app, so you can find them on screen.',
    si: 'බොත්තම් සහ ක්ෂේත්‍රවල නම් යෙදුමේ පෙනෙන ආකාරයටම (ඉංග්‍රීසියෙන්) දක්වා ඇති බැවින් ඒවා තිරයේ පහසුවෙන් සොයාගත හැක.',
  },
  backToTop: { en: 'Back to top', si: 'ඉහළට' },
  note: { en: 'Note', si: 'සටහන' },
}

export const GUIDE: GuideSection[] = [
  // -------------------------------------------------------------------------
  {
    id: 'overview',
    title: { en: 'What this app does', si: 'මෙම යෙදුම කරන්නේ කුමක්ද' },
    intro: {
      en: 'LED Pattern Generator lets you design the animation for a Budurasmala LED matrix in your browser and download a ready-to-upload Arduino sketch. The panel is driven by two 74HC595 shift-register chains — one for the columns, one for the rows — that share a latch pin. Everything you draw plays on a live preview that runs the same logic the Arduino will, so what you see is what the panel does.',
      si: 'LED Pattern Generator මඟින් බුදුරැස්මල LED මැට්‍රික්ස් එකක සජීවිකරණය (animation) ඔබේ බ්‍රවුසරය තුළම නිර්මාණය කර, Arduino එකට කෙලින්ම upload කළ හැකි sketch එකක් බාගත කරගත හැක. පැනලය ක්‍රියා කරන්නේ latch පින් එකක් හවුලේ භාවිත කරන 74HC595 shift-register දාම දෙකකින් — එකක් තීරු (columns) සඳහා, අනෙක පේළි (rows) සඳහා. ඔබ අඳින සෑම දෙයක්ම Arduino එක ක්‍රියාත්මක කරන තර්කයම භාවිත කරන සජීවී පෙරදසුනක ධාවනය වන නිසා, ඔබ දකින දේ පැනලයේ සිදුවන දේමයි.',
    },
    steps: [
      {
        en: 'On the home page, enter a project name, choose the project type and press **Create project**.',
        si: 'මුල් පිටුවේ ව්‍යාපෘති නමක් ඇතුළත් කර, ව්‍යාපෘති වර්ගය තෝරා **Create project** ඔබන්න.',
      },
      {
        en: 'In the project settings bar at the top, set the panel size, LED colours, speed and Arduino pins.',
        si: 'ඉහළ ඇති ව්‍යාපෘති සැකසුම් තීරුවේ පැනලයේ ප්‍රමාණය, LED වර්ණ, වේගය සහ Arduino පින් සකසන්න.',
      },
      {
        en: 'Draw the artwork for the selected frame, or pick a preset design or import an image.',
        si: 'තෝරාගත් රාමුව (frame) සඳහා රූපය අඳින්න, නැතහොත් සූදානම් නිර්මාණයක් (preset) තෝරන්න හෝ පින්තූරයක් ආයාත කරන්න.',
      },
      {
        en: 'Under **Movement**, choose how the frame moves (Scroll, Hold or Bands), for how many steps and how fast.',
        si: '**Movement** යටතේ රාමුව චලනය වන ආකාරය (Scroll, Hold හෝ Bands), පියවර ගණන සහ වේගය තෝරන්න.',
      },
      {
        en: 'Add more frames and arrange them into sequences on the **Timeline**, with a repeat count for each sequence.',
        si: 'තවත් රාමු එක් කර **Timeline** එකේ අනුපිළිවෙළවල් (sequences) ලෙස සකසන්න; එක් එක් අනුපිළිවෙළ කී වරක් නැවත ධාවනය විය යුතුද යන්නද සකසන්න.',
      },
      {
        en: 'Watch the result in the **Preview** tab.',
        si: '**Preview** ටැබය තුළ ප්‍රතිඵලය බලන්න.',
      },
      {
        en: 'Check that it fits your board in the **Memory** tab.',
        si: '**Memory** ටැබය තුළ එය ඔබේ පුවරුවට (board) ගැළපේදැයි පරීක්ෂා කරන්න.',
      },
      {
        en: 'Download the sketch from the **Arduino code** tab and upload it with the Arduino IDE.',
        si: '**Arduino code** ටැබයෙන් sketch එක බාගත කර Arduino IDE මඟින් upload කරන්න.',
      },
      {
        en: 'Press **Save project** to keep a backup file of your work.',
        si: 'ඔබේ වැඩෙහි උපස්ථ ගොනුවක් තබාගැනීමට **Save project** ඔබන්න.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'home',
    title: { en: 'Home page', si: 'මුල් පිටුව' },
    intro: {
      en: 'The home page is where a project starts: create a new one, open a saved file, or continue where you left off.',
      si: 'ව්‍යාපෘතියක් ආරම්භ වන්නේ මුල් පිටුවෙනි: නව ව්‍යාපෘතියක් සාදන්න, සුරකින ලද ගොනුවක් විවෘත කරන්න, නැතහොත් නතර කළ තැනින් දිගටම කරගෙන යන්න.',
    },
    items: [
      {
        label: { en: 'Project name', si: 'Project name (ව්‍යාපෘති නම)' },
        body: {
          en: 'Required. Shown in the header while you work, and used to name the downloaded sketch and wiring images. The create button stays disabled while it is empty.',
          si: 'අනිවාර්යයි. වැඩ කරන අතරතුර ශීර්ෂයේ පෙන්වන අතර, බාගත කරන sketch ගොනුව සහ රැහැන් රූප නම් කිරීමටද භාවිත වේ. එය හිස්ව ඇති විට සාදන බොත්තම ක්‍රියා නොකරයි.',
        },
      },
      {
        label: { en: 'Description', si: 'Description (විස්තරය)' },
        body: {
          en: 'Optional short note about the project, up to 200 characters. It is stored in the project file and can be edited later in the project settings.',
          si: 'අත්‍යවශ්‍ය නොවේ. ව්‍යාපෘතිය ගැන අක්ෂර 200ක් දක්වා කෙටි සටහනක්. එය ව්‍යාපෘති ගොනුවේ ගබඩා වන අතර පසුව ව්‍යාපෘති සැකසුම් තුළ වෙනස් කළ හැක.',
        },
      },
      {
        label: { en: 'Project type', si: 'Project type (ව්‍යාපෘති වර්ගය)' },
        body: {
          en: '**Matrix Budurasmala** is a shift-register LED matrix drawn frame by frame — this is the full editor described in this guide. **Pixel Budurasmala** is coming soon; choosing it creates a placeholder project only.',
          si: '**Matrix Budurasmala** යනු රාමුවෙන් රාමුව අඳින shift-register LED මැට්‍රික්ස් එකකි — මෙම මාර්ගෝපදේශයේ විස්තර කරන සම්පූර්ණ සංස්කාරකය මෙයයි. **Pixel Budurasmala** ඉදිරියේදී පැමිණේ; දැනට එය තේරීමෙන් සාදන්නේ තාවකාලික ව්‍යාපෘතියක් පමණි.',
        },
      },
      {
        label: { en: 'Create project', si: 'Create project' },
        body: {
          en: 'Opens the editor with a new project: an 8 × 32 panel, one empty frame called “Frame 1” inside “Sequence 1”, and a speed controller on pin `A0`.',
          si: 'නව ව්‍යාපෘතියක් සමඟ සංස්කාරකය විවෘත කරයි: 8 × 32 පැනලයක්, “Sequence 1” තුළ “Frame 1” නම් හිස් රාමුවක්, සහ `A0` පින් එකේ වේග පාලකයක්.',
        },
      },
      {
        label: { en: 'Open saved project file', si: 'Open saved project file' },
        body: {
          en: 'Pick a `.budurasmala.json` file saved earlier (older `.ledproj.json` files also work). The app opens it in the right editor. If the file cannot be read, the reason is shown just below the button.',
          si: 'කලින් සුරකින ලද `.budurasmala.json` ගොනුවක් තෝරන්න (පැරණි `.ledproj.json` ගොනුද ක්‍රියා කරයි). යෙදුම එය නිවැරදි සංස්කාරකයේ විවෘත කරයි. ගොනුව කියවිය නොහැකි නම්, හේතුව බොත්තමට පහළින් පෙන්වයි.',
        },
      },
      {
        label: { en: 'File format warning', si: 'ගොනු ආකෘති අනතුරු ඇඟවීම' },
        body: {
          en: 'The app is still under development, so a project file saved today is not guaranteed to open in a later version.',
          si: 'යෙදුම තවමත් සංවර්ධනය වෙමින් පවතින බැවින්, අද සුරකින ව්‍යාපෘති ගොනුවක් පසු සංස්කරණයක විවෘත වන බවට සහතිකයක් නැත.',
        },
      },
      {
        label: { en: 'Continue “…”', si: 'Continue “…”' },
        body: {
          en: 'Appears when you have worked on a project in this browser before. It takes you straight back to that project with all its changes.',
          si: 'මෙම බ්‍රවුසරයේ ඔබ කලින් ව්‍යාපෘතියක වැඩ කර ඇත්නම් පෙන්වයි. එම ව්‍යාපෘතියට එහි සියලු වෙනස්කම් සමඟම කෙලින්ම ආපසු ගෙන යයි.',
        },
      },
    ],
    note: {
      en: 'Opening the site’s main address takes you straight back into your last project. Use the **Home** button (house icon) to reach the home page.',
      si: 'වෙබ් අඩවියේ ප්‍රධාන ලිපිනය විවෘත කළ විට ඔබේ අවසන් ව්‍යාපෘතියටම කෙලින්ම යයි. මුල් පිටුවට යාමට **Home** බොත්තම (නිවසේ අයිකනය) භාවිත කරන්න.',
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'header',
    title: { en: 'Header and saving', si: 'ශීර්ෂ තීරුව සහ සුරැකීම' },
    intro: {
      en: 'The bar across the top of every page holds navigation and project-wide actions.',
      si: 'සෑම පිටුවකම ඉහළ ඇති තීරුවේ සංචාලනය සහ සමස්ත ව්‍යාපෘතියටම අදාළ ක්‍රියා ඇත.',
    },
    items: [
      {
        label: { en: 'Home (house icon)', si: 'Home (නිවසේ අයිකනය)' },
        body: {
          en: 'Goes to the home page to start or open another project. Your current project is already saved in the browser, so nothing is lost.',
          si: 'වෙනත් ව්‍යාපෘතියක් ආරම්භ කිරීමට හෝ විවෘත කිරීමට මුල් පිටුවට යයි. ඔබේ වත්මන් ව්‍යාපෘතිය දැනටමත් බ්‍රවුසරයේ සුරැකී ඇති නිසා කිසිවක් නැති නොවේ.',
        },
      },
      {
        label: { en: 'Undo / Redo', si: 'Undo / Redo' },
        body: {
          en: 'Steps back or forward through your changes — drawing, resizing, colours, movement, timeline edits. Keyboard: `Ctrl+Z` to undo and `Ctrl+Shift+Z` to redo (`Cmd` on a Mac). The shortcuts are ignored while you are typing in a text field.',
          si: 'ඔබ කළ වෙනස්කම් (ඇඳීම, ප්‍රමාණය වෙනස් කිරීම, වර්ණ, චලනය, timeline සංස්කරණ) අතරින් පසුපසට හෝ ඉදිරියට යයි. යතුරුපුවරුව: අහෝසි කිරීමට `Ctrl+Z`, නැවත කිරීමට `Ctrl+Shift+Z` (Mac එකේ `Cmd`). පෙළ ක්ෂේත්‍රයක ටයිප් කරන අතරතුර මෙම කෙටිමං ක්‍රියා නොකරයි.',
        },
      },
      {
        label: { en: 'Save project', si: 'Save project' },
        body: {
          en: 'Shows the file-format warning first; press **Save** to download a `.budurasmala.json` file containing the whole project. Keep it as a backup or to move the project to another computer, then open it with **Open saved project file**.',
          si: 'මුලින් ගොනු ආකෘති අනතුරු ඇඟවීම පෙන්වයි; සම්පූර්ණ ව්‍යාපෘතිය අඩංගු `.budurasmala.json` ගොනුවක් බාගත කිරීමට **Save** ඔබන්න. එය උපස්ථයක් ලෙස හෝ ව්‍යාපෘතිය වෙනත් පරිගණකයකට ගෙන යාමට තබාගෙන, **Open saved project file** මඟින් විවෘත කරන්න.',
        },
      },
      {
        label: { en: 'Guide (book icon)', si: 'Guide (පොතේ අයිකනය)' },
        body: {
          en: 'Opens this guide in a new browser tab, so you can read it beside the editor.',
          si: 'සංස්කාරකය අසලම කියවිය හැකි වන පරිදි මෙම මාර්ගෝපදේශය නව බ්‍රවුසර ටැබයක විවෘත කරයි.',
        },
      },
      {
        label: { en: 'Theme (moon / sun icon)', si: 'Theme (සඳ / හිරු අයිකනය)' },
        body: {
          en: 'Switches between the dark and light look. The choice is remembered in this browser.',
          si: 'අඳුරු සහ ආලෝකමත් පෙනුම අතර මාරු කරයි. තේරීම මෙම බ්‍රවුසරයේ මතක තබාගනී.',
        },
      },
      {
        label: { en: 'Built by Dushan Pramod (footer)', si: 'Built by Dushan Pramod (පාදකය)' },
        body: {
          en: 'Opens the About box with the app version and an email address for bug reports and suggestions.',
          si: 'යෙදුමේ සංස්කරණය සහ දෝෂ වාර්තා හා යෝජනා සඳහා ඊමේල් ලිපිනය සහිත About කොටුව විවෘත කරයි.',
        },
      },
    ],
    note: {
      en: 'Every change is saved automatically in this browser as you work. Browser storage can still be cleared (private windows, clearing site data, another browser), so use **Save project** for anything you want to keep.',
      si: 'ඔබ වැඩ කරන විට සෑම වෙනස්කමක්ම මෙම බ්‍රවුසරයේ ස්වයංක්‍රීයව සුරැකේ. එහෙත් බ්‍රවුසර ගබඩාව මැකී යා හැක (private windows, site data මැකීම, වෙනත් බ්‍රවුසරයක්), එබැවින් තබාගත යුතු සෑම දෙයක් සඳහාම **Save project** භාවිත කරන්න.',
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'project-settings',
    title: { en: 'Project settings bar', si: 'ව්‍යාපෘති සැකසුම් තීරුව' },
    intro: {
      en: 'The panel just below the header describes the physical board the whole project runs on. These settings apply to every frame, not just the selected one.',
      si: 'ශීර්ෂයට පහළින් ඇති කොටස සමස්ත ව්‍යාපෘතියම ක්‍රියාත්මක වන භෞතික පුවරුව විස්තර කරයි. මෙම සැකසුම් තෝරාගත් රාමුවට පමණක් නොව සියලු රාමුවලට අදාළ වේ.',
    },
    items: [
      {
        label: { en: 'Arrow button (show / hide settings)', si: 'ඊතල බොත්තම (සැකසුම් පෙන්වන්න / සඟවන්න)' },
        body: {
          en: 'Expands or collapses the settings. When collapsed, small chips summarise the panel size and colours, the speed, and the SRAM use — click any of them to expand. The open/closed state is remembered in this browser.',
          si: 'සැකසුම් විහිදුවයි හෝ හකුළයි. හකුළා ඇති විට, පැනලයේ ප්‍රමාණය හා වර්ණ, වේගය සහ SRAM භාවිතය කුඩා කොටු (chips) ලෙස සාරාංශ කරයි — විහිදුවීමට ඒ ඕනෑම එකක් ක්ලික් කරන්න. විවෘත/වසා ඇති තත්ත්වය මෙම බ්‍රවුසරයේ මතක තබාගනී.',
        },
      },
      {
        label: { en: 'Project name', si: 'Project name' },
        body: {
          en: 'Rename the project at any time. The downloaded sketch takes this name.',
          si: 'ඕනෑම වේලාවක ව්‍යාපෘතිය නැවත නම් කරන්න. බාගත කරන sketch එකට මෙම නම ලැබේ.',
        },
      },
      {
        label: { en: 'Wiring diagram', si: 'Wiring diagram' },
        body: {
          en: 'Opens the circuit drawing for this panel. See “Wiring diagram” below.',
          si: 'මෙම පැනලය සඳහා පරිපථ සටහන විවෘත කරයි. පහත “Wiring diagram” කොටස බලන්න.',
        },
      },
      {
        label: { en: 'Description', si: 'Description' },
        body: {
          en: 'The optional project note (up to 200 characters).',
          si: 'අත්‍යවශ්‍ය නොවන ව්‍යාපෘති සටහන (අක්ෂර 200ක් දක්වා).',
        },
      },
      {
        label: { en: 'Panel Size · Locked', si: 'Panel Size · Locked' },
        body: {
          en: 'Once the project has frames, the size and LED colours are locked so artwork cannot be damaged by accident. The line shows the current rows × columns, colours and how many frames depend on it.',
          si: 'ව්‍යාපෘතියේ රාමු ඇති විට, අහම්බෙන් රූපවලට හානි නොවන ලෙස ප්‍රමාණය සහ LED වර්ණ අගුළු දමා (locked) ඇත. එම පේළියේ වත්මන් පේළි × තීරු, වර්ණ සහ ඒ මත රඳා පවතින රාමු ගණන පෙන්වයි.',
        },
      },
      {
        label: { en: 'Change panel…', si: 'Change panel…' },
        body: {
          en: 'Unlocks the size and colour controls. A new project already has one frame, so press this first to change the default 8 × 32 size.',
          si: 'ප්‍රමාණය සහ වර්ණ පාලන අගුළු හරියි. නව ව්‍යාපෘතියක දැනටමත් එක් රාමුවක් ඇති නිසා, පෙරනිමි 8 × 32 ප්‍රමාණය වෙනස් කිරීමට මුලින්ම මෙය ඔබන්න.',
        },
      },
      {
        label: { en: 'Rows / Columns', si: 'Rows / Columns (පේළි / තීරු)' },
        body: {
          en: 'Type the panel size: 1–64 rows and 1–128 columns. The new value is applied when you press `Enter` or leave the field. On a round Budurasmala, rows are the rings and columns are the spokes.',
          si: 'පැනලයේ ප්‍රමාණය ටයිප් කරන්න: පේළි 1–64 සහ තීරු 1–128. `Enter` එබූ විට හෝ ක්ෂේත්‍රයෙන් ඉවත් වූ විට නව අගය යෙදේ. රවුම් බුදුරැස්මලක පේළි යනු වළලු (rings) වන අතර තීරු යනු කිරණ (spokes) වේ.',
        },
      },
      {
        label: { en: 'Presets (8 x 32, 16 x 32)', si: 'Presets (8 x 32, 16 x 32)' },
        body: {
          en: 'One click sets a common panel size.',
          si: 'එක් ක්ලික් එකකින් පොදු පැනල ප්‍රමාණයක් සකසයි.',
        },
      },
      {
        label: { en: 'Resize the panel? (confirmation)', si: 'Resize the panel? (තහවුරු කිරීම)' },
        body: {
          en: 'If a smaller size would cut off lit LEDs, the app lists the affected frames and asks first. **Continue** resizes and crops them; **Cancel** keeps the old size. Undo also restores it.',
          si: 'කුඩා ප්‍රමාණයක් නිසා දැල්වූ LED කපා හැරෙන්නේ නම්, යෙදුම බලපාන රාමු ලැයිස්තුගත කර මුලින් විමසයි. **Continue** ප්‍රමාණය වෙනස් කර ඒවා කපා හරියි; **Cancel** පැරණි ප්‍රමාණය තබාගනී. Undo මඟින්ද එය යථා තත්ත්වයට පත් කළ හැක.',
        },
      },
      {
        label: { en: 'LED colours', si: 'LED colours' },
        body: {
          en: 'Opens the per-row colour tools (only while unlocked). See “LED colours” below.',
          si: 'පේළියෙන් පේළියට වර්ණ සැකසීමේ මෙවලම් විවෘත කරයි (අගුළු හැර ඇති විට පමණි). පහත “LED colours” කොටස බලන්න.',
        },
      },
      {
        label: { en: 'Done', si: 'Done' },
        body: {
          en: 'Locks the size and colours again.',
          si: 'ප්‍රමාණය සහ වර්ණ නැවත අගුළු දමයි.',
        },
      },
      {
        label: { en: 'Speed · …', si: 'Speed · …' },
        body: {
          en: 'Shows or hides the speed settings. The button text summarises the current choice, e.g. “A0 pot” or “50 ms fixed”. See “Speed” below.',
          si: 'වේග සැකසුම් පෙන්වයි හෝ සඟවයි. බොත්තමේ පෙළ වත්මන් තේරීම සාරාංශ කරයි, උදා: “A0 pot” හෝ “50 ms fixed”. පහත “Speed” කොටස බලන්න.',
        },
      },
      {
        label: { en: 'Wiring & pins', si: 'Wiring & pins' },
        body: {
          en: 'Shows or hides the Arduino pin numbers and column order. See “Wiring & pins” below.',
          si: 'Arduino පින් අංක සහ තීරු අනුපිළිවෙළ පෙන්වයි හෝ සඟවයි. පහත “Wiring & pins” කොටස බලන්න.',
        },
      },
      {
        label: { en: 'SRAM message', si: 'SRAM පණිවිඩය' },
        body: {
          en: 'Tells you how many bytes of RAM the LED buffers need. It says whether the panel fits an Uno or Nano (2048 B), needs a Mega (8192 B), or is too large even for a Mega — in that case reduce the panel size.',
          si: 'LED buffer සඳහා අවශ්‍ය RAM බයිට් ගණන පවසයි. පැනලය Uno හෝ Nano (2048 B) එකකට ගැළපේද, Mega (8192 B) එකක් අවශ්‍යද, නැතහොත් Mega එකකටත් විශාල වැඩිද යන්න දක්වයි — එසේ නම් පැනලයේ ප්‍රමාණය අඩු කරන්න.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'colours',
    title: { en: 'LED colours', si: 'LED වර්ණ' },
    intro: {
      en: 'Each row of LEDs has a colour, because boards are usually built with one colour per ring. Open these tools with **Change panel…** then **LED colours**.',
      si: 'බොහෝ විට පුවරු සාදන්නේ එක් වළල්ලකට එක් වර්ණයක් ලෙස නිසා, LED සෑම පේළියකටම වර්ණයක් ඇත. **Change panel…** ඉන්පසු **LED colours** ඔබා මෙම මෙවලම් විවෘත කරන්න.',
    },
    items: [
      {
        label: { en: 'Row chips', si: 'පේළි කොටු (Row chips)' },
        body: {
          en: 'One chip per row, showing its colour. Click a chip to select that row (click again to clear it), `Shift`-click to select a range, and `Ctrl`-click to add or remove single rows.',
          si: 'සෑම පේළියකටම එහි වර්ණය පෙන්වන කොටුවක් ඇත. එම පේළිය තේරීමට කොටුවක් ක්ලික් කරන්න (ඉවත් කිරීමට නැවත ක්ලික් කරන්න), පරාසයක් තේරීමට `Shift`-click, තනි පේළි එක් කිරීමට හෝ ඉවත් කිරීමට `Ctrl`-click කරන්න.',
        },
      },
      {
        label: { en: 'All / None', si: 'All / None' },
        body: {
          en: 'Select every row, or clear the selection. With nothing selected, colours are applied to all rows.',
          si: 'සියලු පේළි තෝරන්න, නැතහොත් තේරීම ඉවත් කරන්න. කිසිවක් තෝරා නැති විට, වර්ණ සියලු පේළිවලට යෙදේ.',
        },
      },
      {
        label: { en: 'Preset LED colours', si: 'Preset LED colours' },
        body: {
          en: 'Fourteen common LED colours (red, orange, amber, yellow, green, blue, white, warm white and more). Clicking a swatch applies it immediately to the selected rows.',
          si: 'පොදු LED වර්ණ දාහතරක් (රතු, තැඹිලි, amber, කහ, කොළ, නිල්, සුදු, warm white සහ තවත්). වර්ණ කොටුවක් ක්ලික් කළ විට එය තෝරාගත් පේළිවලට වහාම යෙදේ.',
        },
      },
      {
        label: { en: 'Custom colour', si: 'Custom colour (අභිරුචි වර්ණය)' },
        body: {
          en: 'Pick any colour with the colour picker or type a hex code such as `#ff3b30`, then press `Enter` or the **Apply to …** button.',
          si: 'වර්ණ තෝරකය මඟින් ඕනෑම වර්ණයක් තෝරන්න, නැතහොත් `#ff3b30` වැනි hex කේතයක් ටයිප් කර `Enter` හෝ **Apply to …** බොත්තම ඔබන්න.',
        },
      },
      {
        label: { en: 'Whole-panel schemes', si: 'Whole-panel schemes' },
        body: {
          en: 'Colour the whole panel at once: **All red**, **Red / blue** (alternating rows), **Red / white / blue**, **Buddhist flag** (blue, yellow, red, white, orange repeating), **Rainbow rings**, and **Warm to cool** (amber at the hub to ice blue at the rim).',
          si: 'සම්පූර්ණ පැනලයම එකවර වර්ණ ගන්වන්න: **All red**, **Red / blue** (විකල්ප පේළි), **Red / white / blue**, **Buddhist flag** (නිල්, කහ, රතු, සුදු, තැඹිලි නැවත නැවත), **Rainbow rings**, සහ **Warm to cool** (මැද amber සිට දාරයේ ice blue දක්වා).',
        },
      },
    ],
    note: {
      en: 'Each LED is simply on or off, so colours come from the LEDs you physically fit on each row. They change how the editor and preview look, set the resistor values in the wiring diagram, and are written into the sketch header as an assembly note — but they never change how the sketch runs.',
      si: 'සෑම LED එකක්ම දැල්වී හෝ නිවී පමණක් පවතින නිසා, වර්ණ ලැබෙන්නේ ඔබ එක් එක් පේළියට භෞතිකව සවි කරන LED වලිනි. ඒවා සංස්කාරකයේ සහ පෙරදසුනේ පෙනුම වෙනස් කරයි, රැහැන් සටහනේ ප්‍රතිරෝධක (resistor) අගයන් තීරණය කරයි, සහ sketch එකේ ශීර්ෂයට එකලස් කිරීමේ සටහනක් ලෙස ලියැවේ — නමුත් sketch එක ක්‍රියා කරන ආකාරය කිසිවිටෙක වෙනස් නොකරයි.',
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'speed',
    title: { en: 'Speed', si: 'වේගය (Speed)' },
    intro: {
      en: 'Speed is a decision about the build: either your board has a potentiometer (speed knob) wired to an analog pin, or it plays at one fixed speed. Either way this gives the base speed — the time each animation step is held — and every frame plays at a multiple of it.',
      si: 'වේගය යනු පුවරුව සාදන ආකාරය පිළිබඳ තීරණයකි: ඔබේ පුවරුවට analog පින් එකකට සම්බන්ධ potentiometer (වේග knob) එකක් ඇත, නැතහොත් එය එක් ස්ථාවර වේගයකින් ධාවනය වේ. කෙසේ වුවත් මෙයින් මූලික වේගය (base speed) — සජීවිකරණයේ සෑම පියවරක්ම රඳවා තබන කාලය — ලැබෙන අතර සෑම රාමුවක්ම එහි ගුණිතයකින් ධාවනය වේ.',
    },
    items: [
      {
        label: { en: 'Analog controller', si: 'Analog controller' },
        body: {
          en: 'The sketch reads a potentiometer while the pattern plays, so turning the knob speeds up or slows down the whole animation. This is the default.',
          si: 'රටාව ධාවනය වන අතරතුර sketch එක potentiometer එක කියවන නිසා, knob එක කරකැවීමෙන් සම්පූර්ණ සජීවිකරණයම වේගවත් හෝ මන්දගාමී වේ. මෙය පෙරනිමියයි.',
        },
      },
      {
        label: { en: 'Pin', si: 'Pin' },
        body: {
          en: 'The analog pin the potentiometer’s middle leg is connected to (`A0`–`A7`).',
          si: 'Potentiometer එකේ මැද කකුල සම්බන්ධ කර ඇති analog පින් එක (`A0`–`A7`).',
        },
      },
      {
        label: { en: 'Fastest / Slowest', si: 'Fastest / Slowest' },
        body: {
          en: 'The step time in milliseconds at each end of the knob’s travel (1–5000 ms). Slowest is always kept above Fastest; typing a value that crosses the other end moves that end to match.',
          si: 'Knob එකේ කෙළවර දෙකේදී පියවරක කාලය මිලිතත්පර වලින් (1–5000 ms). Slowest සෑම විටම Fastest ට වඩා වැඩි ලෙස තබයි; අනෙක් කෙළවර පසු කරන අගයක් ටයිප් කළහොත් එම කෙළවරද ඊට ගැළපෙන සේ වෙනස් වේ.',
        },
      },
      {
        label: { en: 'Knob slider', si: 'Knob slider' },
        body: {
          en: 'Stands in for the real knob so you can try speeds in the preview. Its position is also the speed the sketch starts with before it takes its first reading.',
          si: 'පෙරදසුනේ විවිධ වේග අත්හදා බැලීමට සැබෑ knob එක වෙනුවට ක්‍රියා කරයි. පළමු කියවීම ගැනීමට පෙර sketch එක ආරම්භ වන වේගයද මෙහි පිහිටීමයි.',
        },
      },
      {
        label: { en: 'Fixed speed → Delay (ms)', si: 'Fixed speed → Delay (ms)' },
        body: {
          en: 'No knob: one step time (1–5000 ms) is compiled into the sketch and no pin is read.',
          si: 'Knob එකක් නැත: එක් පියවර කාලයක් (1–5000 ms) sketch එකට ඇතුළත් කෙරෙන අතර කිසිදු පින් එකක් කියවන්නේ නැත.',
        },
      },
      {
        label: { en: 'Base speed', si: 'Base speed' },
        body: {
          en: 'The resulting base, shown as milliseconds per step and steps per second. A smaller number of milliseconds means a faster animation.',
          si: 'ලැබෙන මූලික වේගය, පියවරකට මිලිතත්පර සහ තත්පරයකට පියවර ලෙස පෙන්වයි. මිලිතත්පර ගණන අඩු වන තරමට සජීවිකරණය වේගවත් වේ.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'pins',
    title: { en: 'Wiring & pins', si: 'රැහැන් සහ පින් (Wiring & pins)' },
    intro: {
      en: 'Tell the sketch which Arduino pins the shift-register chains are connected to. The numbers must match your actual wiring.',
      si: 'Shift-register දාම සම්බන්ධ කර ඇත්තේ කුමන Arduino පින් වලටදැයි sketch එකට කියන්න. අංක ඔබේ සැබෑ රැහැන් සම්බන්ධතාවලට ගැළපිය යුතුය.',
    },
    items: [
      {
        label: { en: 'data1 / clock1', si: 'data1 / clock1' },
        body: {
          en: 'Data (SER) and clock pins of the column chain — the 74HC595s that choose which LEDs in a row light. Defaults `2` and `3`.',
          si: 'තීරු දාමයේ (column chain) දත්ත (SER) සහ clock පින් — පේළියක කුමන LED දැල්විය යුතුදැයි තෝරන 74HC595. පෙරනිමි `2` සහ `3`.',
        },
      },
      {
        label: { en: 'data2 / clock2', si: 'data2 / clock2' },
        body: {
          en: 'Data and clock pins of the row chain — the 74HC595s that switch one row on at a time. Defaults `4` and `5`.',
          si: 'පේළි දාමයේ (row chain) දත්ත සහ clock පින් — වරකට එක් පේළියක් ක්‍රියාත්මක කරන 74HC595. පෙරනිමි `4` සහ `5`.',
        },
      },
      {
        label: { en: 'latch', si: 'latch' },
        body: {
          en: 'The latch (RCLK) pin shared by both chains, so columns and rows update together. Default `6`.',
          si: 'දාම දෙකම හවුලේ භාවිත කරන latch (RCLK) පින් එක; එමඟින් තීරු සහ පේළි එකවර යාවත්කාලීන වේ. පෙරනිමි `6`.',
        },
      },
      {
        label: { en: 'Column order', si: 'Column order' },
        body: {
          en: '**Ascending** or **Descending**. This depends on how your shift-register chain is physically wired. If the pattern comes out reversed (a mirror image) on the real panel, switch it.',
          si: '**Ascending** හෝ **Descending**. මෙය ඔබේ shift-register දාමය භෞතිකව රැහැන් ගසා ඇති ආකාරය මත රඳා පවතී. සැබෑ පැනලයේ රටාව ආපසු හැරී (දර්පණ ප්‍රතිබිම්බයක් ලෙස) පෙනේ නම්, මෙය මාරු කරන්න.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'wiring-diagram',
    title: { en: 'Wiring diagram', si: 'රැහැන් සටහන (Wiring diagram)' },
    intro: {
      en: 'Opened from **Wiring diagram** in the project settings bar. It draws the circuit this sketch drives, for your panel size, pins and LED colours.',
      si: 'ව්‍යාපෘති සැකසුම් තීරුවේ **Wiring diagram** මඟින් විවෘත වේ. ඔබේ පැනල ප්‍රමාණය, පින් සහ LED වර්ණ සඳහා මෙම sketch එක ක්‍රියා කරවන පරිපථය අඳියි.',
    },
    items: [
      {
        label: { en: '“Not yet tested on real hardware”', si: '“Not yet tested on real hardware”' },
        body: {
          en: 'The circuit has not yet been verified on a prototype. Treat part choices and values as a starting point, check them against your parts’ datasheets, and try a small panel first.',
          si: 'මෙම පරිපථය තවමත් මූලාකෘතියක් මත තහවුරු කර නැත. කොටස් තේරීම් සහ අගයන් ආරම්භක ලක්ෂ්‍යයක් ලෙස සලකා, ඔබේ කොටස්වල datasheets සමඟ පරීක්ෂා කර, මුලින්ම කුඩා පැනලයකින් උත්සාහ කරන්න.',
        },
      },
      {
        label: { en: 'Column transistors · PNP', si: 'Column transistors · PNP' },
        body: {
          en: 'Adds a PNP transistor to drive each column, for panels that need more current than a 74HC595 pin can give. This changes the sketch: column bits are sent inverted (LOW lights a column). Only upload that sketch to a board wired this way.',
          si: '74HC595 පින් එකකට දිය හැකි ප්‍රමාණයට වඩා වැඩි ධාරාවක් අවශ්‍ය පැනල සඳහා, සෑම තීරුවක්ම ක්‍රියා කරවීමට PNP ට්‍රාන්සිස්ටරයක් එක් කරයි. මෙය sketch එක වෙනස් කරයි: තීරු bit ප්‍රතිලෝම කර (LOW මඟින් තීරුවක් දැල්වේ) යවයි. එම sketch එක upload කරන්න මේ ආකාරයට රැහැන් ගසා ඇති පුවරුවකට පමණි.',
        },
      },
      {
        label: { en: 'Row transistors · NPN', si: 'Row transistors · NPN' },
        body: {
          en: 'Adds an NPN transistor for each row. This also changes the sketch: row select becomes active-high (HIGH turns a row on).',
          si: 'සෑම පේළියකටම NPN ට්‍රාන්සිස්ටරයක් එක් කරයි. මෙයද sketch එක වෙනස් කරයි: පේළි තේරීම active-high වේ (HIGH මඟින් පේළියක් ක්‍රියාත්මක වේ).',
        },
      },
      {
        label: { en: 'Zoom − / % / + and Fit', si: 'Zoom − / % / + සහ Fit' },
        body: {
          en: 'Zoom the drawing in and out (or hold `Ctrl` and scroll). Click the percentage for actual size, or **Fit** to fit the window.',
          si: 'සටහන විශාල/කුඩා කරන්න (නැතහොත් `Ctrl` අල්ලාගෙන scroll කරන්න). සැබෑ ප්‍රමාණයට ප්‍රතිශතය ක්ලික් කරන්න, කවුළුවට ගැළපීමට **Fit** ඔබන්න.',
        },
      },
      {
        label: { en: 'Power supply and resistors', si: 'බල සැපයුම සහ ප්‍රතිරෝධක' },
        body: {
          en: 'Beside the drawing: the recommended supply voltage and current (estimated from one full row lit), the column resistor value for each LED colour, and the transistor parts chosen.',
          si: 'සටහන අසල: නිර්දේශිත සැපයුම් වෝල්ටීයතාවය සහ ධාරාව (එක් සම්පූර්ණ පේළියක් දැල්වූ විට ඇස්තමේන්තු කළ), එක් එක් LED වර්ණය සඳහා තීරු ප්‍රතිරෝධක අගය, සහ තෝරාගත් ට්‍රාන්සිස්ටර කොටස්.',
        },
      },
      {
        label: { en: 'Shift-register pinout and pin table', si: 'Shift-register pinout සහ පින් වගුව' },
        body: {
          en: 'Shows every 74HC595 pin and every Arduino connection, so you can wire it step by step.',
          si: 'සෑම 74HC595 පින් එකක්ම සහ සෑම Arduino සම්බන්ධතාවක්ම පෙන්වන නිසා, පියවරෙන් පියවර රැහැන් සම්බන්ධ කළ හැක.',
        },
      },
      {
        label: { en: 'Download', si: 'Download' },
        body: {
          en: 'Saves the diagram together with the pinout as a **PNG image**, **JPG image** or **SVG vector** for printing.',
          si: 'මුද්‍රණය සඳහා සටහන pinout සමඟ **PNG image**, **JPG image** හෝ **SVG vector** ලෙස සුරකියි.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'drawing',
    title: { en: 'Drawing a frame', si: 'රාමුවක් ඇඳීම' },
    intro: {
      en: 'The large grid shows the selected frame, one dot per LED, in the panel’s own row colours. Its title shows the frame name and panel size.',
      si: 'විශාල ජාලකය තෝරාගත් රාමුව පෙන්වයි — සෑම LED එකකටම එක් තිතක් ලෙස, පැනලයේම පේළි වර්ණවලින්. එහි මාතෘකාවේ රාමුවේ නම සහ පැනලයේ ප්‍රමාණය දැක්වේ.',
    },
    items: [
      {
        label: { en: 'Drag to draw', si: 'අඳින්න ඇදගෙන යන්න (Drag)' },
        body: {
          en: 'Press and drag with the left mouse button (or a finger) to light LEDs. Starting on an LED that is already lit erases instead, so one gesture both draws and rubs out.',
          si: 'LED දැල්වීමට වම් mouse බොත්තම (හෝ ඇඟිල්ල) තද කර ඇදගෙන යන්න. දැනටමත් දැල්වී ඇති LED එකකින් ආරම්භ කළහොත් ඒ වෙනුවට මකා දමයි, එබැවින් එකම චලනයකින් ඇඳීමත් මැකීමත් කළ හැක.',
        },
      },
      {
        label: { en: 'Right-click or Ctrl-drag to erase', si: 'මැකීමට Right-click හෝ Ctrl-drag' },
        body: {
          en: 'Always turns LEDs off, wherever you start.',
          si: 'ඔබ ආරම්භ කරන්නේ කොතැනින් වුවත්, සෑම විටම LED නිවා දමයි.',
        },
      },
      {
        label: { en: 'Dashed blue box and dimmed LEDs', si: 'ඉරි සහිත නිල් කොටුව සහ අඳුරු LED' },
        body: {
          en: 'When the frame uses a repeating tile (or a half-width panel), only the area inside the dashed box can be drawn on. The dimmer LEDs outside it are the copies the sketch generates automatically.',
          si: 'රාමුව පුනරාවර්තන ටයිල් (tile) එකක් (හෝ half-width පැනලයක්) භාවිත කරන විට, ඇඳිය හැක්කේ ඉරි සහිත කොටුව තුළ පමණි. ඉන් පිටත ඇති අඳුරු LED යනු sketch එක ස්වයංක්‍රීයව සාදන පිටපත් වේ.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'tile',
    title: { en: 'Pattern tile & drawing', si: 'රටා ටයිල් සහ ඇඳීම (Pattern tile & drawing)' },
    intro: {
      en: 'Tools for the selected frame’s artwork. Everything here affects this frame only.',
      si: 'තෝරාගත් රාමුවේ රූපය සඳහා මෙවලම්. මෙහි ඇති සියල්ල බලපාන්නේ මෙම රාමුවට පමණි.',
    },
    items: [
      {
        label: { en: 'Presets (…)', si: 'Presets (…)' },
        body: {
          en: 'Opens the library of ready-made designs, grouped by style (click a group heading to fold it). Picking one replaces this frame’s drawing and sets the tile size so the design repeats across the panel. Greyed-out designs are too big for this panel — hover to see why. If you never renamed the frame, it takes the design’s name. Undo brings the old drawing back.',
          si: 'ශෛලිය අනුව කාණ්ඩ කළ සූදානම් නිර්මාණ පුස්තකාලය විවෘත කරයි (කාණ්ඩයක් හැකිළීමට එහි මාතෘකාව ක්ලික් කරන්න). එකක් තේරීමෙන් මෙම රාමුවේ ඇඳීම ප්‍රතිස්ථාපනය කර, නිර්මාණය පැනලය පුරා පුනරාවර්තනය වන සේ ටයිල් ප්‍රමාණය සකසයි. අළු පැහැති නිර්මාණ මෙම පැනලයට විශාල වැඩිය — හේතුව බැලීමට mouse එක ඒ මත තබන්න. ඔබ රාමුව නැවත නම් කර නැත්නම්, එයට නිර්මාණයේ නම ලැබේ. Undo මඟින් පැරණි ඇඳීම ආපසු ලැබේ.',
        },
      },
      {
        label: { en: 'Import image…', si: 'Import image…' },
        body: {
          en: 'Turns a PNG, JPG, WebP, GIF or SVG picture into lit and unlit LEDs. See “Importing an image” below.',
          si: 'PNG, JPG, WebP, GIF හෝ SVG පින්තූරයක් දැල්වූ සහ නිවුණු LED බවට පරිවර්තනය කරයි. පහත “පින්තූරයක් ආයාත කිරීම” කොටස බලන්න.',
        },
      },
      {
        label: { en: 'Full panel', si: 'Full panel' },
        body: {
          en: 'The frame stores a drawing for the whole panel.',
          si: 'රාමුව සම්පූර්ණ පැනලය සඳහාම ඇඳීමක් ගබඩා කරයි.',
        },
      },
      {
        label: { en: 'Repeat a tile', si: 'Repeat a tile' },
        body: {
          en: 'Draw a small block that the sketch repeats across the panel. Repeating patterns (flowers, chevrons, dots) take far less memory this way.',
          si: 'Sketch එක පැනලය පුරා පුනරාවර්තනය කරන කුඩා කොටසක් අඳින්න. පුනරාවර්තන රටා (මල්, chevron, තිත්) මේ ආකාරයෙන් ඉතා අඩු මතකයක් ගනී.',
        },
      },
      {
        label: { en: 'Tile rows (yy) / Tile cols (xx)', si: 'Tile rows (yy) / Tile cols (xx)' },
        body: {
          en: 'The size of the tile. Only sizes that divide the panel evenly are offered, because the tile is repeated in whole copies (for example a 32-column panel offers 1, 2, 4, 8, 16 and 32).',
          si: 'ටයිල් එකේ ප්‍රමාණය. ටයිල් එක සම්පූර්ණ පිටපත් ලෙස පුනරාවර්තනය වන නිසා, පැනලය සමානව බෙදෙන ප්‍රමාණ පමණක් ලබා දේ (උදා: තීරු 32ක පැනලයකට 1, 2, 4, 8, 16 සහ 32).',
        },
      },
      {
        label: { en: 'Mirror left/right', si: 'Mirror left/right' },
        body: {
          en: 'Reflects the pattern left-to-right on the panel, for symmetrical designs.',
          si: 'සමමිතික නිර්මාණ සඳහා, පැනලය මත රටාව වමේ සිට දකුණට පරාවර්තනය කරයි.',
        },
      },
      {
        label: { en: 'Clear / Fill / Invert', si: 'Clear / Fill / Invert' },
        body: {
          en: '**Clear** turns every LED in the editable area off, **Fill** turns them all on, and **Invert** swaps lit and unlit.',
          si: '**Clear** සංස්කරණය කළ හැකි ප්‍රදේශයේ සියලු LED නිවා දමයි, **Fill** සියල්ල දල්වයි, **Invert** දැල්වූ සහ නිවුණු ඒවා මාරු කරයි.',
        },
      },
      {
        label: { en: 'Nudge arrows', si: 'Nudge ඊතල' },
        body: {
          en: 'Shift the whole drawing by one LED in any of eight directions, to line it up.',
          si: 'සම්පූර්ණ ඇඳීමම නිවැරදිව පෙළගැස්වීමට, දිශා අටෙන් ඕනෑම එකකට LED එකකින් ගෙන යන්න.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'import-image',
    title: { en: 'Importing an image', si: 'පින්තූරයක් ආයාත කිරීම' },
    intro: {
      en: 'Each LED is only on or off, so a picture is cut into lit and unlit dots at a brightness threshold. The picture fills the area the frame currently draws on (the whole panel, or the tile). An animated GIF imports its first frame.',
      si: 'සෑම LED එකක්ම දැල්වී හෝ නිවී පමණක් පවතින නිසා, පින්තූරයක් දීප්ති සීමාවක් (threshold) අනුව දැල්වූ සහ නිවුණු තිත් බවට කපනු ලැබේ. පින්තූරය රාමුව දැනට අඳින ප්‍රදේශය (සම්පූර්ණ පැනලය හෝ ටයිල් එක) පුරවයි. සජීවී GIF එකක පළමු රාමුව පමණක් ආයාත වේ.',
    },
    items: [
      {
        label: { en: 'The image · crop box', si: 'පින්තූරය · crop කොටුව' },
        body: {
          en: 'Drag the box on the picture to choose the part to use.',
          si: 'භාවිත කළ යුතු කොටස තේරීමට පින්තූරය මත ඇති කොටුව ඇදගෙන යන්න.',
        },
      },
      {
        label: { en: 'Whole image', si: 'Whole image' },
        body: {
          en: 'Resets the selection to the entire picture.',
          si: 'තේරීම සම්පූර්ණ පින්තූරයටම නැවත සකසයි.',
        },
      },
      {
        label: { en: 'Match panel / tile shape', si: 'Match panel / tile shape' },
        body: {
          en: 'Reshapes the selection to the same proportions as the area it will fill, so nothing is squashed or left empty.',
          si: 'තේරීම එය පුරවන ප්‍රදේශයේ සමානුපාතයටම හැඩගස්වයි; එවිට කිසිවක් තෙරපී හෝ හිස්ව නොයයි.',
        },
      },
      {
        label: { en: 'On the … preview', si: 'On the … පෙරදසුන' },
        body: {
          en: 'Shows exactly how the result will look on your board, in its row colours.',
          si: 'ප්‍රතිඵලය ඔබේ පුවරුවේ, එහි පේළි වර්ණවලින්, හරියටම පෙනෙන ආකාරය පෙන්වයි.',
        },
      },
      {
        label: { en: 'If the shapes differ: Fit / Fill / Stretch', si: 'If the shapes differ: Fit / Fill / Stretch' },
        body: {
          en: '**Fit** keeps the whole selection inside and leaves the rest dark. **Fill** fills the area and trims whatever hangs over. **Stretch** squashes it to fit exactly, changing proportions. When the shapes already match, all three give the same result.',
          si: '**Fit** සම්පූර්ණ තේරීමම ඇතුළත තබා ඉතිරිය අඳුරුව තබයි. **Fill** ප්‍රදේශය පුරවා, පිටතට නෙරා ඇති කොටස් කපා හරියි. **Stretch** හරියටම ගැළපෙන සේ තෙරපයි; සමානුපාත වෙනස් වේ. හැඩ දැනටමත් ගැළපේ නම්, තුනම එකම ප්‍රතිඵලය දෙයි.',
        },
      },
      {
        label: { en: 'Brightness threshold', si: 'Brightness threshold (දීප්ති සීමාව)' },
        body: {
          en: 'Anything brighter than this value (0–255) lights up; the line below shows how many LEDs are lit. It starts on an automatic value chosen for the picture — drag to adjust, or click **Back to automatic**. Transparent areas count as unlit.',
          si: 'මෙම අගයට (0–255) වඩා දීප්තිමත් ඕනෑම දෙයක් දැල්වේ; පහත පේළියේ දැල්වෙන LED ගණන පෙන්වයි. එය පින්තූරයට ගැළපෙන සේ ස්වයංක්‍රීයව තෝරාගත් අගයකින් ආරම්භ වේ — වෙනස් කිරීමට ඇදගෙන යන්න, නැතහොත් **Back to automatic** ක්ලික් කරන්න. විනිවිද පෙනෙන ප්‍රදේශ නිවුණු ලෙස සැලකේ.',
        },
      },
      {
        label: { en: 'Invert', si: 'Invert' },
        body: {
          en: 'Lights the dark parts instead — useful for a dark drawing on a white background.',
          si: 'ඒ වෙනුවට අඳුරු කොටස් දල්වයි — සුදු පසුබිමක ඇති අඳුරු ඇඳීමකට ප්‍රයෝජනවත්.',
        },
      },
      {
        label: { en: 'Use this image / Cancel', si: 'Use this image / Cancel' },
        body: {
          en: '**Use this image** replaces the frame’s drawing (undo restores it). **Cancel** closes without changes. If nothing is lit, lower the threshold or tick Invert.',
          si: '**Use this image** රාමුවේ ඇඳීම ප්‍රතිස්ථාපනය කරයි (undo මඟින් එය යථා තත්ත්වයට පත් කළ හැක). **Cancel** වෙනස්කම් නොමැතිව වසා දමයි. කිසිවක් දැල්වී නැත්නම්, සීමාව අඩු කරන්න හෝ Invert සලකුණු කරන්න.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'movement',
    title: { en: 'Movement', si: 'චලනය (Movement)' },
    intro: {
      en: 'How the selected frame animates, how long it lasts and how fast it plays. A frame’s playing time is its number of steps multiplied by its step time.',
      si: 'තෝරාගත් රාමුව සජීවීකරණය වන ආකාරය, එය පවතින කාලය සහ ධාවනය වන වේගය. රාමුවක ධාවන කාලය = පියවර ගණන × පියවරක කාලය.',
    },
    items: [
      {
        label: { en: 'Scroll', si: 'Scroll' },
        body: {
          en: 'Slides the pattern across the panel. Pick one of eight directions on the arrow pad; the centre dot means no movement. The line of code underneath is the step exactly as it will be written into the sketch.',
          si: 'රටාව පැනලය හරහා ලිස්සා යවයි. ඊතල පුවරුවෙන් දිශා අටෙන් එකක් තෝරන්න; මැද තිත යනු චලනයක් නැති බවයි. පහළ ඇති කේත පේළිය යනු sketch එකට ලියැවෙන ආකාරයටම එම පියවරයි.',
        },
      },
      {
        label: { en: 'Fill panel before scrolling', si: 'Fill panel before scrolling' },
        body: {
          en: 'Starts with the pattern already covering the panel, instead of scrolling it in from a blank panel.',
          si: 'හිස් පැනලයකින් රටාව ලිස්සා ඇතුළු කරනවා වෙනුවට, රටාව දැනටමත් පැනලය පුරා ඇති ලෙස ආරම්භ කරයි.',
        },
      },
      {
        label: { en: 'Hold', si: 'Hold' },
        body: {
          en: 'Shows the pattern without moving it, for the number of steps set below.',
          si: 'පහත සකසන පියවර ගණන තෙක්, රටාව චලනය නොකර පෙන්වයි.',
        },
      },
      {
        label: { en: 'Bands', si: 'Bands' },
        body: {
          en: 'Splits the panel into stripes that move independently. Available only when rows or columns divide evenly into bands.',
          si: 'පැනලය ස්වාධීනව චලනය වන තීරු (stripes) වලට බෙදයි. පේළි හෝ තීරු සමානව කොටස්වලට බෙදිය හැකි විට පමණක් ලබා ගත හැක.',
        },
      },
      {
        label: { en: 'Split: Rows ←→ / Columns ↑↓', si: 'Split: Rows ←→ / Columns ↑↓' },
        body: {
          en: '**Rows ←→** makes horizontal stripes of rows that slide left or right. **Columns ↑↓** makes vertical stripes of columns that slide up or down.',
          si: '**Rows ←→** වමට හෝ දකුණට ලිස්සා යන පේළිවල තිරස් තීරු සාදයි. **Columns ↑↓** ඉහළට හෝ පහළට ලිස්සා යන තීරුවල සිරස් තීරු සාදයි.',
        },
      },
      {
        label: { en: 'Bands (count) and Band 1, 2, …', si: 'Bands (ගණන) සහ Band 1, 2, …' },
        body: {
          en: 'Choose how many bands, then click each band’s button to flip its direction (left/right or up/down). Alternating directions give the classic Budurasmala “counter-rotating rings” effect.',
          si: 'Band ගණන තෝරා, එක් එක් band එකේ දිශාව (වම/දකුණ හෝ ඉහළ/පහළ) මාරු කිරීමට එහි බොත්තම ක්ලික් කරන්න. විකල්ප දිශා මඟින් සම්ප්‍රදායික බුදුරැස්මලේ “ප්‍රතිවිරුද්ධව කැරකෙන වළලු” ආචරණය ලැබේ.',
        },
      },
      {
        label: { en: 'Steps', si: 'Steps (පියවර)' },
        body: {
          en: 'For Scroll and Bands: how many one-LED shifts are played. For Hold: how many steps the pattern stays. It is a count, not a delay — a scroll of as many steps as the panel is tall brings the pattern all the way round.',
          si: 'Scroll සහ Bands සඳහා: LED එකක් බැගින් කොපමණ වාර ගණනක් මාරු කරන්නේද යන්න. Hold සඳහා: රටාව රැඳී සිටින පියවර ගණන. මෙය ගණනකි, ප්‍රමාදයක් නොවේ — පැනලයේ උසට සමාන පියවර ගණනක scroll එකකින් රටාව සම්පූර්ණයෙන්ම වටයක් යයි.',
        },
      },
      {
        label: { en: 'Step speed: Follow base', si: 'Step speed: Follow base' },
        body: {
          en: 'The frame plays at a multiple of the project’s base speed, so turning the speed knob rescales the whole show. The multiple is how long each step is held: **1x** equals the base, **2x** holds each step twice as long (slower), **0.5x** half as long (faster). Pick a preset from 0.25x to 4x, or type a **Custom** value.',
          si: 'රාමුව ව්‍යාපෘතියේ මූලික වේගයේ ගුණිතයකින් ධාවනය වන නිසා, වේග knob එක කරකැවීමෙන් සම්පූර්ණ දර්ශනයම ඒ අනුව වෙනස් වේ. ගුණිතය යනු සෑම පියවරක්ම රඳවා තබන කාලයයි: **1x** මූලික වේගයට සමානයි, **2x** සෑම පියවරක්ම දෙගුණයක් කල් රඳවයි (මන්දගාමී), **0.5x** අඩක් කල් (වේගවත්). 0.25x සිට 4x දක්වා preset එකක් තෝරන්න, නැතහොත් **Custom** අගයක් ටයිප් කරන්න.',
        },
      },
      {
        label: { en: 'Step speed: Fixed ms', si: 'Step speed: Fixed ms' },
        body: {
          en: 'Pins this frame to its own step time in milliseconds (1–5000). It then ignores both the base speed and the knob.',
          si: 'මෙම රාමුවට මිලිතත්පර වලින් (1–5000) තමන්ගේම පියවර කාලයක් නියම කරයි. එවිට එය මූලික වේගය සහ knob එක යන දෙකම නොසලකයි.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'timeline',
    title: { en: 'Timeline', si: 'කාලරේඛාව (Timeline)' },
    intro: {
      en: 'The timeline at the bottom is the order the panel plays in. Frames are grouped into sequences; the sketch plays every sequence in turn, each repeated as many times as set, then starts again from the top. The time next to **Timeline** is one full lap (with a knob fitted, at the knob’s current position).',
      si: 'පහළ ඇති timeline එක පැනලය ධාවනය වන අනුපිළිවෙළයි. රාමු අනුපිළිවෙළවල් (sequences) වලට කාණ්ඩ කර ඇත; sketch එක සෑම sequence එකක්ම වාරයෙන් වාරය, සකසා ඇති වාර ගණනක් නැවත නැවත ධාවනය කර, නැවත මුල සිට ආරම්භ කරයි. **Timeline** අසල ඇති කාලය එක් සම්පූර්ණ වටයකි (knob එකක් ඇත්නම්, එහි වත්මන් පිහිටීමට අනුව).',
    },
    items: [
      {
        label: { en: '+ Frame / + Sequence', si: '+ Frame / + Sequence' },
        body: {
          en: '**+ Frame** at the top adds a new empty frame; the dashed **+ Frame** card inside a sequence adds one to that sequence. **+ Sequence** adds a new empty sequence.',
          si: 'ඉහළ ඇති **+ Frame** නව හිස් රාමුවක් එක් කරයි; sequence එකක් තුළ ඇති ඉරි සහිත **+ Frame** කාඩ්පත එම sequence එකටම රාමුවක් එක් කරයි. **+ Sequence** නව හිස් sequence එකක් එක් කරයි.',
        },
      },
      {
        label: { en: 'Sequence name and repeat', si: 'Sequence නම සහ repeat' },
        body: {
          en: 'Rename the sequence, and set how many times it plays in a row before moving on. The time beside it is the total including repeats (hover for one pass).',
          si: 'Sequence එක නැවත නම් කරන්න, සහ ඊළඟ එකට යාමට පෙර එය කී වරක් අඛණ්ඩව ධාවනය විය යුතුදැයි සකසන්න. අසල ඇති කාලය නැවත ධාවන ඇතුළුව මුළු කාලයයි (එක් වටයක කාලය බැලීමට mouse එක ඒ මත තබන්න).',
        },
      },
      {
        label: { en: 'Grip handle, ↑ / ↓', si: 'අල්ලන හසුරුව (grip), ↑ / ↓' },
        body: {
          en: 'Drag a sequence by its grip handle (the dotted icon) to reorder, or use the up and down arrows.',
          si: 'අනුපිළිවෙළ වෙනස් කිරීමට sequence එකක් එහි grip හසුරුවෙන් (තිත් සහිත අයිකනය) ඇදගෙන යන්න, නැතහොත් ඉහළ සහ පහළ ඊතල භාවිත කරන්න.',
        },
      },
      {
        label: { en: 'Duplicate / Delete sequence', si: 'Sequence පිටපත් කිරීම / මකා දැමීම' },
        body: {
          en: 'The copy icon duplicates the sequence with all its frames; the red × deletes it. Undo brings a deleted sequence back.',
          si: 'පිටපත් අයිකනය sequence එක එහි සියලු රාමු සමඟ පිටපත් කරයි; රතු × එය මකා දමයි. Undo මඟින් මකා දැමූ sequence එකක් ආපසු ලැබේ.',
        },
      },
      {
        label: { en: 'Frame cards', si: 'රාමු කාඩ්පත් (Frame cards)' },
        body: {
          en: 'Click a card to select that frame for editing (it gets a blue outline). Each card shows a thumbnail, an editable name, a short movement summary (e.g. “up 8”, “hold 40”) and the frame’s play time (hover for details).',
          si: 'සංස්කරණය සඳහා එම රාමුව තේරීමට කාඩ්පතක් ක්ලික් කරන්න (එයට නිල් දාරයක් ලැබේ). සෑම කාඩ්පතකම කුඩා රූපයක්, සංස්කරණය කළ හැකි නමක්, කෙටි චලන සාරාංශයක් (උදා: “up 8”, “hold 40”) සහ රාමුවේ ධාවන කාලය (විස්තර සඳහා mouse එක ඒ මත තබන්න) දැක්වේ.',
        },
      },
      {
        label: { en: 'Moving, copying and deleting frames', si: 'රාමු ගෙන යාම, පිටපත් කිරීම සහ මකා දැමීම' },
        body: {
          en: 'Drag a frame card to a new position, or into another sequence. Hover a card to reveal its copy (duplicate) and red × (delete) buttons.',
          si: 'රාමු කාඩ්පතක් නව ස්ථානයකට හෝ වෙනත් sequence එකකට ඇදගෙන යන්න. පිටපත් කිරීමේ සහ රතු × (මකා දැමීමේ) බොත්තම් පෙනීමට mouse එක කාඩ්පත මත තබන්න.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'preview',
    title: { en: 'Preview tab', si: 'පෙරදසුන් ටැබය (Preview)' },
    intro: {
      en: 'Plays the timeline exactly as the Arduino will, step by step and at the real step times.',
      si: 'Timeline එක Arduino එක ධාවනය කරන ආකාරයටම, පියවරෙන් පියවර සහ සැබෑ පියවර කාලවලින් ධාවනය කරයි.',
    },
    items: [
      {
        label: { en: 'Play / Pause', si: 'Play / Pause' },
        body: {
          en: 'Starts or stops the animation. It loops from the end back to the start.',
          si: 'සජීවිකරණය ආරම්භ කරයි හෝ නවත්වයි. අවසානයට පැමිණි පසු නැවත මුල සිට ධාවනය වේ.',
        },
      },
      {
        label: { en: 'This frame only', si: 'This frame only' },
        body: {
          en: 'Plays just the selected frame over and over, handy while fine-tuning its movement.',
          si: 'තෝරාගත් රාමුව පමණක් නැවත නැවත ධාවනය කරයි; එහි චලනය සියුම්ව සකසන විට ප්‍රයෝජනවත්.',
        },
      },
      {
        label: { en: '2D / 3D', si: '2D / 3D' },
        body: {
          en: '**3D** shows a glowing model of the board: drag to orbit around it and scroll to zoom. It loads the first time you open it.',
          si: '**3D** දිලිසෙන පුවරු ආකෘතියක් පෙන්වයි: එය වටා කැරකවීමට ඇදගෙන යන්න, zoom කිරීමට scroll කරන්න. පළමු වරට විවෘත කරන විට එය load වේ.',
        },
      },
      {
        label: { en: 'Flat / Round / Fan', si: 'Flat / Round / Fan' },
        body: {
          en: '**Flat** shows the rectangular grid. **Round** wraps it into a disc — every column becomes a spoke and every row a ring, column 1 pointing up. **Fan** spreads the spokes over part of a circle, like a Budurasmala behind a Buddha statue. The sketch is the same in every view; this only changes how the rows and columns are laid out on screen.',
          si: '**Flat** සෘජුකෝණාස්‍රාකාර ජාලකය පෙන්වයි. **Round** එය තැටියක් ලෙස ඔතයි — සෑම තීරුවක්ම කිරණයක් (spoke) සහ සෑම පේළියක්ම වළල්ලක් (ring) වේ; 1 වන තීරුව ඉහළට යොමු වේ. **Fan** බුදු පිළිමයක් පිටුපස ඇති බුදුරැස්මලක් මෙන්, කිරණ වෘත්තයක කොටසක් පුරා පතුරුවයි. සෑම දර්ශනයකදීම sketch එක එකමයි; මෙයින් වෙනස් වන්නේ පේළි සහ තීරු තිරයේ පෙළගැසෙන ආකාරය පමණි.',
        },
      },
      {
        label: { en: 'Sweep (Fan only)', si: 'Sweep (Fan සඳහා පමණි)' },
        body: {
          en: 'How much of the circle the fan covers, from 120° to 330°, centred on the top. The rest stays dark at the bottom.',
          si: 'Fan එක වෘත්තයෙන් කොපමණ ප්‍රමාණයක් ආවරණය කරයිද යන්න, ඉහළ කේන්ද්‍ර කර 120° සිට 330° දක්වා. ඉතිරි කොටස පහළින් අඳුරුව පවතී.',
        },
      },
      {
        label: { en: 'Row 1 at the rim (strips wired inwards)', si: 'Row 1 at the rim (strips wired inwards)' },
        body: {
          en: 'By default row 1 is the innermost ring. Tick this if your board has row 1 on the outer edge.',
          si: 'පෙරනිමියෙන් 1 වන පේළිය ඇතුළතම වළල්ලයි. ඔබේ පුවරුවේ 1 වන පේළිය පිටත දාරයේ නම් මෙය සලකුණු කරන්න.',
        },
      },
      {
        label: { en: 'Scrub slider and step line', si: 'Scrub slider සහ පියවර පේළිය' },
        body: {
          en: 'Drag the slider to jump to any step (this pauses playback). The line below shows the step number, the frame playing and its step time.',
          si: 'ඕනෑම පියවරකට පැනීමට slider එක ඇදගෙන යන්න (එමඟින් ධාවනය නතර වේ). පහළ පේළියේ පියවර අංකය, ධාවනය වන රාමුව සහ එහි පියවර කාලය පෙන්වයි.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'code',
    title: { en: 'Arduino code tab', si: 'Arduino code ටැබය' },
    intro: {
      en: 'The finished sketch, generated from your project and updated live as you edit.',
      si: 'ඔබේ ව්‍යාපෘතියෙන් නිපදවන, ඔබ සංස්කරණය කරන විට සජීවීව යාවත්කාලීන වන සම්පූර්ණ sketch එක.',
    },
    items: [
      {
        label: { en: 'Download …ino', si: 'Download …ino' },
        body: {
          en: 'Downloads the sketch as a `.ino` file named after the project.',
          si: 'ව්‍යාපෘතියේ නමින් ඇති `.ino` ගොනුවක් ලෙස sketch එක බාගත කරයි.',
        },
      },
      {
        label: { en: 'Copy', si: 'Copy' },
        body: {
          en: 'Copies the sketch to the clipboard, to paste into the Arduino IDE.',
          si: 'Arduino IDE එකට paste කිරීම සඳහා sketch එක clipboard එකට පිටපත් කරයි.',
        },
      },
      {
        label: { en: 'Split designs into a second file', si: 'Split designs into a second file' },
        body: {
          en: 'Moves the pattern tables into a separate `patterns.ino` so the main file stays short. The download button then saves both files — keep them in the same folder.',
          si: 'ප්‍රධාන ගොනුව කෙටිව තබාගැනීමට රටා වගු වෙනම `patterns.ino` ගොනුවකට ගෙන යයි. එවිට බාගත කිරීමේ බොත්තම ගොනු දෙකම සුරකියි — ඒවා එකම ෆෝල්ඩරයේ තබන්න.',
        },
      },
    ],
    steps: [
      {
        en: 'Create a folder with exactly the same name as the `.ino` file (without `.ino`), as the tab tells you, and put the downloaded file(s) inside.',
        si: 'ටැබයේ සඳහන් කරන පරිදි, `.ino` ගොනුවේ නමටම (`.ino` නොමැතිව) සමාන නමක් ඇති ෆෝල්ඩරයක් සාදා, බාගත කළ ගොනු(ව) එහි තබන්න.',
      },
      {
        en: 'Open the `.ino` file with the Arduino IDE.',
        si: '`.ino` ගොනුව Arduino IDE මඟින් විවෘත කරන්න.',
      },
      {
        en: 'Choose your board (e.g. Arduino Uno, Nano or Mega) and its port under Tools.',
        si: 'Tools යටතේ ඔබේ පුවරුව (උදා: Arduino Uno, Nano හෝ Mega) සහ එහි port එක තෝරන්න.',
      },
      {
        en: 'Press Upload.',
        si: 'Upload ඔබන්න.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'memory',
    title: { en: 'Memory tab', si: 'මතක ටැබය (Memory)' },
    intro: {
      en: 'Checks whether the sketch fits your Arduino. Flash is where the program and patterns are stored; SRAM is the working memory. On these panels SRAM usually runs out first.',
      si: 'Sketch එක ඔබේ Arduino එකට ගැළපේදැයි පරීක්ෂා කරයි. Flash යනු වැඩසටහන සහ රටා ගබඩා වන ස්ථානයයි; SRAM යනු ක්‍රියාකාරී මතකයයි. මෙවැනි පැනලවල සාමාන්‍යයෙන් මුලින්ම අවසන් වන්නේ SRAM ය.',
    },
    items: [
      {
        label: { en: 'Board', si: 'Board (පුවරුව)' },
        body: {
          en: 'The Arduino you will upload to. Its limits set the size of the bars. When the compile helper is connected, the list shows every board it has installed.',
          si: 'ඔබ upload කරන Arduino එක. එහි සීමාවන් අනුව තීරුවල ප්‍රමාණය තීරණය වේ. Compile helper සම්බන්ධ වූ විට, එහි ස්ථාපනය කර ඇති සියලු පුවරු ලැයිස්තුවේ පෙන්වයි.',
        },
      },
      {
        label: { en: 'Flash (program storage)', si: 'Flash (program storage)' },
        body: {
          en: 'Without a compiler this is an estimate given as a range (usually within 10%). After **Check memory** it is the real figure. The bar turns amber above 80% and red when it no longer fits.',
          si: 'Compiler එකක් නොමැතිව මෙය පරාසයක් ලෙස දෙන ඇස්තමේන්තුවකි (සාමාන්‍යයෙන් 10% ක් ඇතුළත). **Check memory** පසු එය සැබෑ අගයයි. 80% ට වැඩි විට තීරුව amber පැහැ වන අතර, තවදුරටත් නොගැළපේ නම් රතු වේ.',
        },
      },
      {
        label: { en: 'SRAM (global variables)', si: 'SRAM (global variables)' },
        body: {
          en: 'Exact even without a compiler, because the app knows every variable it writes. Leave some room: local variables use what is left while the sketch runs.',
          si: 'යෙදුම තමන් ලියන සෑම variable එකක්ම දන්නා නිසා, compiler එකක් නොමැතිවත් නිවැරදියි. යම් ඉඩක් ඉතිරි කරන්න: sketch එක ධාවනය වන විට local variables ඉතිරි ඉඩ භාවිත කරයි.',
        },
      },
      {
        label: { en: 'Check memory', si: 'Check memory' },
        body: {
          en: 'Compiles the sketch with the real Arduino compiler and shows the measured figures, or the compiler’s error message. It needs the compile helper running on your computer.',
          si: 'සැබෑ Arduino compiler එකෙන් sketch එක compile කර මනින ලද අගයන්, නැතහොත් compiler දෝෂ පණිවිඩය පෙන්වයි. මේ සඳහා ඔබේ පරිගණකයේ compile helper ධාවනය විය යුතුය.',
        },
      },
      {
        label: { en: 'Set up compiling / Compiling setup', si: 'Set up compiling / Compiling setup' },
        body: {
          en: 'Opens the step-by-step setup for the compile helper. See the next section.',
          si: 'Compile helper සඳහා පියවරෙන් පියවර සැකසුම විවෘත කරයි. ඊළඟ කොටස බලන්න.',
        },
      },
      {
        label: { en: 'Optimise for low memory: Off / Safe / Aggressive', si: 'Optimise for low memory: Off / Safe / Aggressive' },
        body: {
          en: '**Off** writes one readable table per frame, exactly as drawn. **Safe** shares identical artwork and drops a RAM buffer, while the tables stay readable. **Aggressive** also pools and packs tables — smaller, but no longer pleasant to edit by hand. The sketch you download always uses the level chosen here, and it lights exactly the same LEDs in the same order whichever level you pick.',
          si: '**Off** සෑම රාමුවකටම, ඇඳි ආකාරයටම, කියවිය හැකි එක් වගුවක් ලියයි. **Safe** සමාන රූප හවුලේ භාවිත කර RAM buffer එකක් ඉවත් කරයි; වගු තවමත් කියවිය හැක. **Aggressive** වගු එකතු කර සංකෝචනයද කරයි — කුඩායි, නමුත් අතින් සංස්කරණය කිරීමට පහසු නැත. ඔබ බාගත කරන sketch එක සෑම විටම මෙහි තෝරාගත් මට්ටම භාවිත කරන අතර, කුමන මට්ටම තේරුවත් එකම LED එකම අනුපිළිවෙළට දල්වයි.',
        },
      },
      {
        label: { en: 'Find the smallest build', si: 'Find the smallest build' },
        body: {
          en: 'With Safe or Aggressive chosen and the helper connected, compiles many combinations of optimisations and keeps whichever is really smallest. A table shows each candidate’s SRAM and Flash change, then a summary and the list of optimisations kept.',
          si: 'Safe හෝ Aggressive තෝරා helper සම්බන්ධ කර ඇති විට, ප්‍රශස්තකරණ (optimisations) සංයෝජන රාශියක් compile කර සැබවින්ම කුඩාම එක තබාගනී. වගුවක සෑම අපේක්ෂකයකගේම SRAM සහ Flash වෙනස පෙන්වා, ඉන්පසු සාරාංශයක් සහ තබාගත් ප්‍රශස්තකරණ ලැයිස්තුව පෙන්වයි.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'compile-helper',
    title: { en: 'Setting up the compile helper', si: 'Compile helper සැකසීම' },
    intro: {
      en: 'A web page cannot run the Arduino compiler, so real memory figures come from a small helper you run on your own computer. It needs no admin rights and no Node.js, only listens on your own machine (`127.0.0.1`), and only answers this site. It is optional — everything else works without it.',
      si: 'වෙබ් පිටුවකට Arduino compiler එක ධාවනය කළ නොහැකි නිසා, සැබෑ මතක අගයන් ලැබෙන්නේ ඔබේම පරිගණකයේ ධාවනය කරන කුඩා helper එකකිනි. එයට admin අයිතිවාසිකම් හෝ Node.js අවශ්‍ය නැත, ඔබේම යන්ත්‍රයේ (`127.0.0.1`) පමණක් සවන් දෙයි, සහ මෙම වෙබ් අඩවියට පමණක් පිළිතුරු දෙයි. එය අත්‍යවශ්‍ය නොවේ — අනෙක් සියල්ල එය නොමැතිවම ක්‍රියා කරයි.',
    },
    steps: [
      {
        en: 'In the Memory tab press **Set up compiling**, and choose your system tab: **Windows**, **macOS** or **Linux**.',
        si: 'Memory ටැබයේ **Set up compiling** ඔබා, ඔබේ පද්ධතියේ ටැබය තෝරන්න: **Windows**, **macOS** හෝ **Linux**.',
      },
      {
        en: 'Open a terminal (on Windows: press `Win+R`, type `powershell`, press Enter), copy the setup command with the copy button and paste it in. Prefer to read it first? Use **Download** and run the downloaded file instead.',
        si: 'Terminal එකක් විවෘත කරන්න (Windows හි: `Win+R` ඔබා, `powershell` ටයිප් කර Enter ඔබන්න), copy බොත්තමෙන් සැකසුම් විධානය පිටපත් කර එහි paste කරන්න. මුලින් කියවා බැලීමට කැමතිද? ඒ වෙනුවට **Download** භාවිත කර බාගත කළ ගොනුව ධාවනය කරන්න.',
      },
      {
        en: 'Let it set itself up. It uses `arduino-cli` if you already have it; otherwise it downloads it (~30 MB) and the `arduino:avr` board package (~50 MB, once). When it prints “Bridge is running”, leave that window open.',
        si: 'එයට තනිවම සැකසීමට ඉඩ දෙන්න. ඔබ සතුව දැනටමත් `arduino-cli` ඇත්නම් එය භාවිත කරයි; නැත්නම් එය (~30 MB) සහ `arduino:avr` පුවරු පැකේජය (~50 MB, එක් වරක් පමණි) බාගත කරයි. “Bridge is running” මුද්‍රණය වූ පසු, එම කවුළුව විවෘතව තබන්න.',
      },
      {
        en: 'Come back to the page and press **Connect** (or reload). When the status strip says **Connected**, close the dialog and press **Check memory**.',
        si: 'පිටුවට ආපසු පැමිණ **Connect** ඔබන්න (නැතහොත් reload කරන්න). තත්ත්ව තීරුවේ **Connected** පෙන්වූ පසු, dialog එක වසා **Check memory** ඔබන්න.',
      },
    ],
    items: [
      {
        label: { en: 'Browsers', si: 'බ්‍රවුසර' },
        body: {
          en: 'Use Chrome, Edge or Firefox. Safari blocks a website from talking to the helper, and the dialog warns you if you are using it. If Chrome asks for permission to reach devices on your local network, allow it.',
          si: 'Chrome, Edge හෝ Firefox භාවිත කරන්න. Safari වෙබ් අඩවියකට helper සමඟ සන්නිවේදනය කිරීම අවහිර කරන අතර, ඔබ එය භාවිත කරන්නේ නම් dialog එක අනතුරු අඟවයි. ඔබේ දේශීය ජාලයේ උපාංග වෙත ළඟා වීමට Chrome අවසර ඉල්ලුවහොත්, එයට ඉඩ දෙන්න.',
        },
      },
      {
        label: { en: 'Stopping and removing it', si: 'නැවැත්වීම සහ ඉවත් කිරීම' },
        body: {
          en: 'Press `Ctrl+C` in the helper’s window to stop it. To remove it completely, delete the folder it installed `arduino-cli` into (shown in step 2 of the dialog). Sketches are compiled in your temp folder and never leave your computer.',
          si: 'නැවැත්වීමට helper කවුළුවේ `Ctrl+C` ඔබන්න. සම්පූර්ණයෙන්ම ඉවත් කිරීමට, එය `arduino-cli` ස්ථාපනය කළ ෆෝල්ඩරය (dialog එකේ 2 වන පියවරේ පෙන්වා ඇත) මකා දමන්න. Sketches compile වන්නේ ඔබේ temp ෆෝල්ඩරයේ වන අතර ඒවා කිසිවිටෙක ඔබේ පරිගණකයෙන් පිටතට නොයයි.',
        },
      },
      {
        label: { en: 'If something goes wrong', si: 'යමක් වැරදුණහොත්' },
        body: {
          en: 'Open **If something goes wrong** at the bottom of the dialog for fixes to common problems: the page cannot see the helper, a firewall prompt, “scripts are disabled” on Windows, a missing board package, or `arduino-cli` installed somewhere unusual.',
          si: 'පොදු ගැටලු සඳහා විසඳුම් ලබා ගැනීමට dialog එකේ පහළ ඇති **If something goes wrong** විවෘත කරන්න: පිටුවට helper එක නොපෙනීම, firewall විමසීමක්, Windows හි “scripts are disabled”, පුවරු පැකේජයක් නොමැති වීම, හෝ `arduino-cli` අසාමාන්‍ය ස්ථානයක ස්ථාපනය කර තිබීම.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'troubleshooting',
    title: { en: 'Tips and troubleshooting', si: 'ඉඟි සහ ගැටලු විසඳීම' },
    items: [
      {
        label: { en: 'The pattern is reversed on the real panel', si: 'සැබෑ පැනලයේ රටාව ආපසු හැරී ඇත' },
        body: {
          en: 'Open **Wiring & pins** and switch **Column order** between Ascending and Descending, then upload again.',
          si: '**Wiring & pins** විවෘත කර **Column order** එක Ascending සහ Descending අතර මාරු කර, නැවත upload කරන්න.',
        },
      },
      {
        label: { en: 'Nothing lights, or the panel looks scrambled', si: 'කිසිවක් නොදැල්වේ, නැතහොත් පැනලය අවුල් සහගතයි' },
        body: {
          en: 'Check that the pin numbers under **Wiring & pins** match your wiring, and that the transistor ticks in the **Wiring diagram** match how the board is actually built — they change the signals the sketch sends.',
          si: '**Wiring & pins** යටතේ ඇති පින් අංක ඔබේ රැහැන් සම්බන්ධතාවලට ගැළපේද, සහ **Wiring diagram** හි ට්‍රාන්සිස්ටර සලකුණු පුවරුව සැබවින්ම සාදා ඇති ආකාරයට ගැළපේද යන්න පරීක්ෂා කරන්න — ඒවා sketch එක යවන සංඥා වෙනස් කරයි.',
        },
      },
      {
        label: { en: 'The sketch is too big for my board', si: 'Sketch එක මගේ පුවරුවට විශාල වැඩියි' },
        body: {
          en: 'Use **Repeat a tile** for repeating designs, delete unused frames, try **Safe** or **Aggressive** in the Memory tab, choose a smaller panel, or use an Arduino Mega.',
          si: 'පුනරාවර්තන නිර්මාණ සඳහා **Repeat a tile** භාවිත කරන්න, භාවිත නොකරන රාමු මකා දමන්න, Memory ටැබයේ **Safe** හෝ **Aggressive** උත්සාහ කරන්න, කුඩා පැනලයක් තෝරන්න, නැතහොත් Arduino Mega එකක් භාවිත කරන්න.',
        },
      },
      {
        label: { en: 'The animation is too fast or too slow', si: 'සජීවිකරණය ඉතා වේගවත් හෝ මන්දගාමී' },
        body: {
          en: 'Change the base under **Speed** to affect everything, or the selected frame’s multiple under **Movement → Step speed** to affect only that frame. Remember that a bigger multiple (e.g. 2x) is slower.',
          si: 'සියල්ලටම බලපෑමට **Speed** යටතේ මූලික වේගය වෙනස් කරන්න, නැතහොත් එම රාමුවට පමණක් බලපෑමට **Movement → Step speed** යටතේ තෝරාගත් රාමුවේ ගුණිතය වෙනස් කරන්න. විශාල ගුණිතයක් (උදා: 2x) මන්දගාමී බව මතක තබාගන්න.',
        },
      },
      {
        label: { en: 'I can’t change the panel size', si: 'මට පැනලයේ ප්‍රමාණය වෙනස් කළ නොහැක' },
        body: {
          en: 'Expand the project settings and press **Change panel…** first. Press **Done** when finished.',
          si: 'ව්‍යාපෘති සැකසුම් විහිදුවා මුලින්ම **Change panel…** ඔබන්න. අවසන් වූ පසු **Done** ඔබන්න.',
        },
      },
      {
        label: { en: 'Mirroring is ignored', si: 'Mirror ක්‍රියා නොකරයි' },
        body: {
          en: 'On a half-width panel, mirroring only applies to Hold and to scrolls that move up or down. Add an up or down direction, or switch to Hold.',
          si: 'Half-width පැනලයක, mirror යෙදෙන්නේ Hold සහ ඉහළට හෝ පහළට චලනය වන scroll සඳහා පමණි. ඉහළ හෝ පහළ දිශාවක් එක් කරන්න, නැතහොත් Hold වෙත මාරු වන්න.',
        },
      },
      {
        label: { en: 'I made a mistake', si: 'මම වැරැද්දක් කළා' },
        body: {
          en: 'Press **Undo** or `Ctrl+Z` — almost every change, including deleting frames and sequences, can be undone.',
          si: '**Undo** හෝ `Ctrl+Z` ඔබන්න — රාමු සහ sequences මකා දැමීම ඇතුළුව, බොහෝ සෑම වෙනස්කමක්ම අහෝසි කළ හැක.',
        },
      },
      {
        label: { en: 'Found a bug or have an idea?', si: 'දෝෂයක් හමු වූවාද, නැතහොත් අදහසක් තිබේද?' },
        body: {
          en: 'Click **Built by Dushan Pramod** at the bottom of any page for the contact email.',
          si: 'සම්බන්ධ කරගැනීමේ ඊමේල් ලිපිනය සඳහා ඕනෑම පිටුවක පහළ ඇති **Built by Dushan Pramod** ක්ලික් කරන්න.',
        },
      },
    ],
  },
]
