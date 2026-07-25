// Three curated occasion lists:
//
// 1) Iranian national occasions on a *fixed* solar (Jalali) date -
//    Nowruz, Nature Day, the Revolution anniversary, plus a broad set
//    of non-holiday but officially/widely-recognized "named days"
//    (professional days, cultural commemorations, world observances
//    fixed to a Jalali date) - e.g. Nurse Day, Engineer Day, Veterinary
//    Day. These need no calendar conversion at all, so there's no
//    accuracy concern from calendar math - each entry was sourced from
//    Iran's own yearly calendar coverage (bahesab.ir's day-by-day
//    1405-specific calendar, cross-checked against a second source for
//    the higher-stakes entries). A small number of candidate entries
//    were deliberately left out because they turned out to actually be
//    Hijri (lunar) in origin rather than truly Jalali-fixed, or because
//    sources disagreed and neither could be confirmed:
//      - "Day of Arafah" (9 Dhu al-Hijjah) - lunar, already covered
//        correctly via FIXED_HIJRI_OCCASIONS below instead of a
//        hardcoded Jalali guess that would drift out of sync in other
//        years.
//      - "Quds Day" - defined as the last Friday of Ramadan, a floating
//        rule (lunar month + weekday), not expressible as a fixed
//        Jalali date at all.
//      - "Passing of Hazrat Khadijah" - traditionally tied to a lunar
//        date multiple sources give differently; skipped rather than
//        guess.
//      - one Esfand entry ("روز تکریم") whose source text came back
//        garbled/unclear on a re-check - skipped rather than ship an
//        unverified date.
//
// 2) Well-established Shia/Iranian occasions on a *fixed* Hijri
//    (lunar) date - Ashura, Eid al-Fitr, etc. These are exact on the
//    Hijri calendar itself; the Gregorian/Jalali -> Hijri conversion
//    (see utils/hijri.js) is calibrated against Iran's official
//    government holiday calendar so these line up with the dates
//    users actually see marked as holidays elsewhere.
export const FIXED_JALALI_OCCASIONS = {
  // --- Official public holidays (holiday: true -> shown in red) ---
  "1-1": { fa: "جشن نوروز", en: "Nowruz (Persian New Year)", holiday: true },
  "1-2": { fa: "تعطیلات نوروز", en: "Nowruz holiday", holiday: true },
  "1-3": { fa: "تعطیلات نوروز", en: "Nowruz holiday", holiday: true },
  "1-4": { fa: "تعطیلات نوروز", en: "Nowruz holiday", holiday: true },
  "1-12": { fa: "روز جمهوری اسلامی", en: "Islamic Republic Day", holiday: true },
  "1-13": { fa: "روز طبیعت (سیزده‌به‌در)", en: "Nature Day (Sizdah Bedar)", holiday: true },
  "2-11": { fa: "روز جهانی کارگر", en: "International Workers' Day", holiday: true },
  "3-14": { fa: "سالگرد رحلت امام خمینی", en: "Anniversary of Imam Khomeini's passing", holiday: true },
  "3-15": { fa: "قیام پانزده خرداد", en: "15 Khordad Uprising", holiday: true },
  "11-22": { fa: "پیروزی انقلاب اسلامی", en: "Islamic Revolution Victory Day", holiday: true },
  "12-29": { fa: "روز ملی شدن صنعت نفت", en: "Oil Industry Nationalization Day", holiday: true },

  // --- Named non-holiday days (مناسبت‌های غیرتعطیل) ---
  "1-6": { fa: "زادروز زرتشت پیامبر", en: "Birthday of the Prophet Zoroaster" },
  "1-7": { fa: "روز هنرهای نمایشی", en: "World Theatre Day" },
  "1-15": { fa: "روز ذخایر ژنتیکی و زیستی", en: "Genetic & Biological Resources Day" },
  "1-17": { fa: "روز فرهنگ پهلوانی و ورزش زورخانه‌ای", en: "Pahlavani Culture & Zoorkhaneh Sports Day" },
  "1-18": { fa: "روز سلامتی", en: "Health Day" },
  "1-20": { fa: "روز ملی فناوری هسته‌ای و روز هنر انقلاب اسلامی", en: "National Nuclear Technology Day & Islamic Revolution Art Day" },
  "1-29": { fa: "روز ارتش جمهوری اسلامی", en: "Iranian Army (Ground Forces) Day" },
  "1-30": { fa: "روز دختران", en: "National Girls' Day" },
  "1-31": { fa: "روز گندم و نان", en: "Wheat and Bread Day" },

  "2-1": { fa: "بزرگداشت سعدی و روز نثر فارسی", en: "Saadi Commemoration Day & Persian Prose Day" },
  "2-2": { fa: "روز زمین پاک", en: "Clean Earth Day" },
  "2-3": { fa: "بزرگداشت شیخ بهایی، روز ملی کارآفرینی و روز معماری", en: "Sheikh Bahai Day, National Entrepreneurship Day & Architecture Day" },
  "2-7": { fa: "روز ایمنی حمل و نقل", en: "Transport Safety Day" },
  "2-9": { fa: "روز ملی روانشناس و مشاور", en: "National Psychologist & Counselor Day" },
  "2-10": { fa: "روز ملی خلیج فارس", en: "National Persian Gulf Day" },
  "2-15": { fa: "روز جهانی ماما", en: "World Midwife Day" },
  "2-18": { fa: "روز بیماری‌های خاص و روز جهانی صلیب سرخ و هلال احمر", en: "Rare Disease Day & World Red Cross-Red Crescent Day" },
  "2-19": { fa: "روز اسناد ملی و میراث مکتوب", en: "National Documents & Written Heritage Day" },
  "2-20": { fa: "روز گل محمدی و گلاب", en: "Damask Rose & Rosewater Day" },
  "2-22": { fa: "روز مشاغل خانگی", en: "Home-Based Occupations Day" },
  "2-25": { fa: "بزرگداشت فردوسی و روز پاسداشت زبان فارسی", en: "Ferdowsi Day & Persian Language Day" },
  "2-27": { fa: "روز ارتباطات و روابط عمومی", en: "Communications & Public Relations Day" },
  "2-28": { fa: "بزرگداشت خیام و روز جهانی موزه", en: "Omar Khayyam Day & World Museum Day" },
  "2-30": { fa: "روز ملی جمعیت", en: "National Population Day" },
  "2-31": { fa: "روز اهدای عضو و روز بوم‌گردی", en: "Organ Donation Day & Ecotourism Day" },

  "3-1": { fa: "روز بهره‌وری و بهینه‌سازی مصرف و بزرگداشت ملاصدرا", en: "Productivity Day & Mulla Sadra Commemoration" },
  "3-4": { fa: "روز دزفول - روز مقاومت و پایداری", en: "Dezful Day - Resistance & Steadfastness Day" },
  "3-7": { fa: "روز نقشه‌برداری", en: "Surveying Day" },
  "3-8": { fa: "روز مشاور املاک", en: "Real Estate Consultant Day" },
  "3-10": { fa: "روز جهانی بدون دخانیات", en: "World No Tobacco Day" },
  "3-20": { fa: "روز صنایع دستی و روز ملی فرش", en: "Handicrafts Day & National Carpet Day" },
  "3-21": { fa: "روز خانواده و تکریم بازنشستگان", en: "Family & Retirees Respect Day" },
  "3-26": { fa: "روز شعر و ادبیات آیینی", en: "Religious Poetry & Literature Day" },
  "3-27": { fa: "روز امر به معروف و نهی از منکر و روز جهانی بیابان‌زدایی", en: "Enjoining Good Day & World Desertification Day" },
  "3-30": { fa: "روز صنعت موتورسیکلت", en: "Motorcycle Industry Day" },
  "3-31": { fa: "روز بسیج استادان", en: "Professors' Basij Day" },

  "4-1": { fa: "روز اصناف", en: "Guilds/Trade Unions Day" },
  "4-5": { fa: "روز صنعت ابزارآلات و روز جهانی مبارزه با مواد مخدر", en: "Tools Industry Day & World Anti-Narcotics Day" },
  "4-6": { fa: "روز عینک‌سازی و بینایی‌سنجی", en: "Optics & Optometry Day" },
  "4-7": { fa: "روز قوه قضاییه", en: "Judiciary Day" },
  "4-8": { fa: "روز مبارزه با سلاح‌های شیمیایی و میکروبی", en: "Anti-Chemical/Biological Weapons Day" },
  "4-10": { fa: "روز صنعت و معدن و روز دیپلماسی فرهنگی", en: "Industry & Mining Day & Cultural Diplomacy Day" },
  "4-12": { fa: "روز خیاط و نساجی", en: "Tailor & Textile Industry Day" },
  "4-14": { fa: "روز قلم و روز شهرداری و دهیاری", en: "Pen Day & Municipality Day" },
  "4-16": { fa: "روز مالیات", en: "Tax Day" },
  "4-18": { fa: "روز ادبیات کودکان و نوجوانان", en: "Children's & Youth Literature Day" },
  "4-21": { fa: "روز عفاف و حجاب", en: "Chastity & Hijab Day" },
  "4-22": { fa: "بزرگداشت خوارزمی و روز فناوری اطلاعات", en: "Khwarizmi Day & IT Day" },
  "4-23": { fa: "روز گفتگو و تعامل سازنده", en: "Constructive Dialogue Day" },
  "4-25": { fa: "روز بهزیستی و تأمین اجتماعی", en: "Welfare & Social Security Day" },
  "4-30": { fa: "روز خلبان", en: "Pilot's Day" },
  "4-31": { fa: "بزرگداشت سلمان فارسی", en: "Salman-e Farsi Commemoration" },

  "5-6": { fa: "روز کارآفرینی و آموزش‌های فنی و حرفه‌ای", en: "Entrepreneurship & Vocational Training Day" },
  "5-9": { fa: "روز اهدای خون", en: "Blood Donation Day" },
  "5-10": { fa: "روز جهانی شیر مادر", en: "World Breastfeeding Day" },
  "5-14": { fa: "صدور فرمان مشروطیت و روز حقوق بشر اسلامی", en: "Constitutional Decree Day & Islamic Human Rights Day" },
  "5-17": { fa: "روز خبرنگار", en: "Journalist Day" },
  "5-18": { fa: "بزرگداشت شهدای مدافع حرم", en: "Shrine Defenders' Martyrs Commemoration" },
  "5-20": { fa: "روز وقف", en: "Endowment (Waqf) Day" },
  "5-26": { fa: "بازگشت آزادگان", en: "Returned Freed POWs Day" },
  "5-31": { fa: "روز صنایع دفاعی و روز عسل", en: "Defense Industries Day & Honey Day" },

  "6-1": { fa: "بزرگداشت ابوعلی سینا", en: "Avicenna (Ibn Sina) Commemoration Day" },
  "6-2": { fa: "آغاز هفته دولت", en: "Government Week begins" },
  "6-4": { fa: "روز کارمند", en: "Government Employee Day" },
  "6-5": { fa: "روز سیستان و بلوچستان", en: "Sistan & Baluchestan Day" },
  "6-10": { fa: "روز بانکداری اسلامی", en: "Islamic Banking Day" },
  "6-11": { fa: "روز صنعت چاپ", en: "Printing Industry Day" },
  "6-13": { fa: "روز تعاون", en: "Cooperatives Day" },
  "6-14": { fa: "روز قم", en: "Qom Day" },
  "6-17": { fa: "قیام ۱۷ شهریور", en: "17 Shahrivar Uprising" },
  "6-21": { fa: "روز سینما", en: "Cinema Day" },
  "6-26": { fa: "روز فوریت‌های پزشکی", en: "Medical Emergency (EMS) Day" },
  "6-27": { fa: "روز شعر و ادب فارسی", en: "Persian Poetry & Literature Day" },

  "7-1": { fa: "روز پرچم", en: "Flag Day" },
  "7-4": { fa: "روز سرباز", en: "Soldier's Day" },
  "7-5": { fa: "روز گردشگری و روز جهانی جهانگردی", en: "Tourism Day & World Tourism Day" },
  "7-7": { fa: "روز آتش‌نشانی و ایمنی", en: "Firefighting & Safety Day" },
  "7-8": { fa: "بزرگداشت مولوی و روز جهانی دریانوردی", en: "Rumi (Mowlavi) Day & World Maritime Day" },
  "7-9": { fa: "روز جهانی سالمندان", en: "International Day of Older Persons" },
  "7-10": { fa: "روز نخبگان", en: "Elites Day" },
  "7-14": { fa: "روز دامپزشکی", en: "National Veterinary Day" },
  "7-15": { fa: "روز روستا و عشایر", en: "Rural & Nomads Day" },
  "7-16": { fa: "روز جهانی کودک", en: "World Children's Day" },
  "7-17": { fa: "روز جهانی پست", en: "World Post Day" },
  "7-20": { fa: "بزرگداشت حافظ", en: "Hafez Day" },
  "7-22": { fa: "روز جهانی استاندارد", en: "World Standards Day" },
  "7-23": { fa: "روز جهانی نابینایان", en: "International White Cane (Blind) Day" },
  "7-24": { fa: "روز پرستار و روز جهانی غذا", en: "Nurse Day & World Food Day" },
  "7-26": { fa: "روز تربیت بدنی و ورزش", en: "Physical Education & Sports Day" },
  "7-29": { fa: "روز صادرات", en: "Export Day" },

  "8-1": { fa: "روز آمار و برنامه‌ریزی و روز صنعت ساختمان", en: "Statistics & Planning Day & Building Industry Day" },
  "8-5": { fa: "روز زعفران", en: "Saffron Day" },
  "8-7": { fa: "روز انار", en: "Pomegranate Day" },
  "8-8": { fa: "روز نوجوان و بسیج", en: "Teenager & Basij Day" },
  "8-13": { fa: "روز دانش‌آموز", en: "Student Day (school)" },
  "8-14": { fa: "روز فرهنگ عمومی و روز مازندران", en: "Public Culture Day & Mazandaran Day" },
  "8-18": { fa: "روز کیفیت", en: "Quality Day" },
  "8-19": { fa: "روز جهانی علم در خدمت صلح و توسعه", en: "World Science Day for Peace and Development" },
  "8-21": { fa: "روز هوافضا", en: "Aerospace Day" },
  "8-24": { fa: "روز کتاب و کتاب‌خوانی", en: "Book and Reading Day" },
  "8-25": { fa: "روز صنعت نوشت‌افزار و روز اصفهان", en: "Stationery Industry Day & Isfahan Day" },
  "8-26": { fa: "سالروز آزادسازی سوسنگرد", en: "Susangerd Liberation Anniversary" },
  "8-30": { fa: "روز حکمت و فلسفه، بزرگداشت فارابی و روز قهرمان ملی", en: "Wisdom & Philosophy Day, Al-Farabi Day & National Hero Day" },

  "9-1": { fa: "روز صنعت سرب و روی", en: "Lead & Zinc Industry Day" },
  "9-2": { fa: "روز تکریم مادران و همسران شهدا", en: "Martyrs' Mothers & Wives Respect Day" },
  "9-4": { fa: "روز زیتون", en: "Olive Day" },
  "9-5": { fa: "روز بسیج مستضعفان", en: "Basij (Mobilization of the Oppressed) Day" },
  "9-7": { fa: "روز نیروی دریایی", en: "Navy Day" },
  "9-9": { fa: "روز جزایر سه‌گانه خلیج فارس", en: "Persian Gulf Three Islands Day" },
  "9-10": { fa: "روز مجلس و روز جهانی مبارزه با ایدز", en: "Parliament Day & World AIDS Day" },
  "9-12": { fa: "روز قانون اساسی و روز جهانی معلولین", en: "Constitution Day & International Day of Disabled Persons" },
  "9-13": { fa: "روز بیمه", en: "Insurance Day" },
  "9-15": { fa: "روز حسابدار", en: "Accountant Day" },
  "9-16": { fa: "روز دانشجو و روز جهانی هواپیمایی", en: "Student Day & World Aviation Day" },
  "9-18": { fa: "روز سد و نیروگاه برق‌آبی", en: "Dam & Hydroelectric Power Day" },
  "9-22": { fa: "روز صنعت مس", en: "Copper Industry Day" },
  "9-25": { fa: "روز پژوهش", en: "Research Day" },
  "9-26": { fa: "روز حمل و نقل و رانندگان", en: "Transportation & Drivers Day" },
  "9-27": { fa: "روز وحدت حوزه و دانشگاه و روز جهان عاری از خشونت", en: "Seminary-University Unity Day & World Day of Non-Violence" },
  "9-30": { fa: "شب یلدا", en: "Yalda Night" },

  "10-1": { fa: "روز آرایشگر", en: "Hairdresser/Barber Day" },
  "10-3": { fa: "روز ثبت احوال", en: "Civil Registry Day" },
  "10-4": { fa: "بزرگداشت رودکی", en: "Rudaki Commemoration" },
  "10-5": { fa: "روز ایمنی در برابر زلزله", en: "Earthquake Safety Day" },
  "10-6": { fa: "روز دفاتر اسناد رسمی", en: "Notary Offices Day" },
  "10-7": { fa: "تشکیل نهضت سواد آموزی", en: "Literacy Movement Founding Day" },
  "10-8": { fa: "روز صنعت پتروشیمی و روز صنعت سیمان", en: "Petrochemical Industry Day & Cement Industry Day" },
  "10-9": { fa: "روز بصیرت", en: "Insight Day" },
  "10-12": { fa: "روز علوم انسانی اسلامی", en: "Islamic Humanities Day" },
  "10-13": { fa: "روز جهانی مقاومت و سالروز شهادت سردار سلیمانی", en: "Global Resistance Day & Soleimani Martyrdom Anniversary" },
  "10-17": { fa: "بزرگداشت خواجوی کرمانی و روز کرمان", en: "Khajavi Kermani Day & Kerman Day" },
  "10-19": { fa: "قیام خونین مردم قم", en: "Qom Bloody Uprising Anniversary" },
  "10-20": { fa: "روز قناد، صنعت شیرینی و شکلات", en: "Confectioner/Candy & Chocolate Industry Day" },
  "10-22": { fa: "روز پاسدار", en: "IRGC Guardian Day" },
  "10-23": { fa: "روز جانباز", en: "War-Disabled Veterans Day" },
  "10-24": { fa: "روز صحیفه سجادیه", en: "Sahifa Sajjadiyya Day" },
  "10-29": { fa: "روز معاینه فنی خودرو", en: "Vehicle Technical Inspection Day" },
  "10-30": { fa: "روز جوان", en: "Youth Day" },

  "11-1": { fa: "روز بزرگداشت خاقانی شروانی", en: "Khaghani Shervani Commemoration" },
  "11-6": { fa: "روز آواها و نواهای ایرانی و روز جهانی گمرک", en: "Iranian Music Day & World Customs Day" },
  "11-11": { fa: "روز ویراستار", en: "Editor's Day" },
  "11-12": { fa: "بازگشت امام خمینی به ایران - آغاز دهه فجر", en: "Imam Khomeini's Return - Dahe-ye Fajr begins" },
  "11-14": { fa: "روز فناوری فضایی", en: "Space Technology Day" },
  "11-19": { fa: "روز نیروی هوایی", en: "Air Force Day" },
  "11-20": { fa: "روز چهارمحال و بختیاری", en: "Chaharmahal & Bakhtiari Day" },
  "11-21": { fa: "شکسته شدن حکومت نظامی", en: "Martial Law Broken (1357) Anniversary" },
  "11-29": { fa: "روز اقتصاد مقاومتی و کارآفرینی", en: "Resistance Economy & Entrepreneurship Day" },

  "12-5": { fa: "روز مهندس (بزرگداشت خواجه نصیرالدین طوسی)", en: "Engineer's Day (Khwaja Nasir al-Din Tusi Commemoration)" },
  "12-7": { fa: "روز نهج‌البلاغه", en: "Nahj al-Balagha Day" },
  "12-8": { fa: "روز حمایت از بیماران نادر و روز کارکنان آموزش و پرورش", en: "Rare Disease Patients Support Day & Education Staff Day" },
  "12-10": { fa: "روز بازاریابی و مدیران فروش", en: "Marketing & Sales Managers Day" },
  "12-15": { fa: "روز درختکاری", en: "Arbor (Tree Planting) Day" },
  "12-16": { fa: "روز کارشناس تغذیه", en: "Nutritionist Day" },
  "12-18": { fa: "بزرگداشت سید جمال‌الدین اسدآبادی و روز بوشهر", en: "Seyyed Jamal al-Din Asadabadi Day & Bushehr Day" },
  "12-21": { fa: "بزرگداشت نظامی گنجوی و روز گورستان‌بانان", en: "Nezami Ganjavi Day & Cemetery Caretakers Day" },
  "12-23": { fa: "روز صنعت طلا، جواهر، نقره و سنگ‌های قیمتی", en: "Gold, Jewelry, Silver & Gemstone Industry Day" },
  "12-25": { fa: "بزرگداشت پروین اعتصامی و روز احترام به همسایه", en: "Parvin E'tesami Day & Neighbor Respect Day" },
};

// Keyed "hijriMonth-hijriDay" (1-based month, 1 = Muharram).
// holiday: true where confirmed against Iran's official public holiday
// list (26 days for 1405) - notably 1 Muharram (Islamic New Year) and
// 9 Dhu al-Hijjah (Day of Arafah) are widely-observed occasions but
// NOT official days off, confirmed via search, so they're left
// unflagged even though they're religiously significant.
export const FIXED_HIJRI_OCCASIONS = {
  "1-1": { fa: "آغاز سال نو قمری", en: "Islamic New Year" },
  "1-9": { fa: "تاسوعای حسینی", en: "Tasua", holiday: true },
  "1-10": { fa: "عاشورای حسینی", en: "Ashura", holiday: true },
  "2-20": { fa: "اربعین حسینی", en: "Arbaeen", holiday: true },
  "2-28": { fa: "رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)", en: "Passing of the Prophet & martyrdom of Imam Hasan", holiday: true },
  "2-29": { fa: "شهادت امام رضا (ع)", en: "Martyrdom of Imam Reza", holiday: true },
  "3-8": { fa: "شهادت امام حسن عسکری (ع)", en: "Martyrdom of Imam Hassan Askari", holiday: true },
  "3-17": { fa: "میلاد پیامبر اکرم (ص) و امام جعفر صادق (ع)", en: "Birth of the Prophet & Imam Ja'far al-Sadiq", holiday: true },
  "7-13": { fa: "میلاد امام علی (ع)", en: "Birth of Imam Ali", holiday: true },
  "7-27": { fa: "مبعث پیامبر اکرم (ص)", en: "Mab'ath of the Prophet", holiday: true },
  "8-15": { fa: "میلاد امام زمان (عج)", en: "Birth of Imam Mahdi", holiday: true },
  "9-21": { fa: "شهادت امام علی (ع)", en: "Martyrdom of Imam Ali", holiday: true },
  "10-1": { fa: "عید فطر", en: "Eid al-Fitr", holiday: true },
  "10-2": { fa: "تعطیلات عید فطر", en: "Eid al-Fitr holiday", holiday: true },
  "12-9": { fa: "روز عرفه", en: "Day of Arafah" },
  "12-10": { fa: "عید قربان", en: "Eid al-Adha", holiday: true },
  "12-18": { fa: "عید غدیر خم", en: "Eid al-Ghadir", holiday: true },
};

export function fixedJalaliOccasionFor(jMonth1Based, jDay) {
  return FIXED_JALALI_OCCASIONS[`${jMonth1Based}-${jDay}`] || null;
}

export function fixedHijriOccasionFor(hMonth1Based, hDay) {
  return FIXED_HIJRI_OCCASIONS[`${hMonth1Based}-${hDay}`] || null;
}
