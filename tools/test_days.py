import sys; sys.path.insert(0,'/workspace/p3'); from days import days_of
C=[("Happy Hour Monday 11am–6pm, Tuesday–Friday 3–6pm","Mon-Fri"),("Happy Hour Monday 11am-6pm, Tuesday-Friday 3pm-6pm","Mon-Fri"),
("Happy hour every Monday through Friday from 3–7pm","Mon-Fri"),("Happy hour weekdays 4-7","Mon-Fri"),("Mon-Thu 4-7pm & Sat 2-5pm","Mon-Thu,Sat"),
("Tuesday and Thursday karaoke","Tue,Thu"),("Fri & Sat DJ nights","Fri,Sat"),("Sat-Sun brunch specials","Sat,Sun"),("Friday through Sunday","Fri-Sun"),
("Sunday-Thursday 9pm-close, Fri-Sat 10pm-close","Daily"),("Thurs - Sat 5-7","Thu-Sat"),("Wednesdays $5 burgers","Wed"),("Weds wing night","Wed"),
("Sat - Mon late night","Sat-Mon"),("Happy Hour specials are available Sunday through Thursday from 3–6 PM","Sun-Thu"),("Sunday through Friday from 4–6","Sun-Fri"),("Kick off the weekend with 6 wings for $5","See venue"),("Mon-Fri 3-6, weekends 12-4","Mon-Fri"),("Happy hour 4-7 daily","Daily"),("SUN - SAT: 12:00 PM - 11:00 PM Happy Hour: Monday-Friday 3 PM -7 PM","Mon-Fri"),("Plus, our daily food and drink specials and weekday Happy Hour from 2–6PM","Mon-Fri"),("Monday–Friday: 11am–6pm All-Day Happy Hour Every Tuesday","Mon-Fri"),("Happy Hour Tue–Fri 4–7 PM · Sunday Brunch 11 AM–2 PM","Tue-Fri"),("SUN: 4:00 PM - 9:00 PM MON - SAT: 5:00 PM - 10:00 PM HAPPY HOUR: MON - FRI: 5:00 PM - 7:00 PM","Mon-Fri"),("Tue-Fri 4-6pm and Sunday all day","Tue-Fri,Sun"),
("Enjoy the sun on our patio, happy hour 4-6","See venue"),("Happy hour 3-6pm","See venue"),("Mon. - Fri. 4-7","Mon-Fri"),("Monday to Wednesday 5-7pm","Mon-Wed")]
C+=[("SUN - THU: 12:00 PM - 10:00 PM FRI - SAT: 12:00 PM - 11:00 PM Happy Hour: Monday-Friday 3 PM -7 PM","Mon-Fri"),
("Join us for happy hour every weekday from 3pm – 5pm and live DJ sets every Saturday from 12pm – 5pm","Mon-Fri"),
("Now available during our $14 cocktail hours, Tuesday - Thursday and Sunday from 5-7PM","Tue-Thu,Sun"),
("And don't forget the wing special — $1 wings ALL DAY Monday, and during Happy Hours Tue–Fri","Mon-Fri"),("Sunday to Thursday 8 am - 10:30 pm Friday & Saturday 8 am - 11:30 pm Happy Hour (Monday - Friday) 3 pm - 7 pm","Mon-Fri"),("MONDAY — BOGO Burger TUESDAY — BOGO App WEDNESDAY — Kids Eat FREE","Mon-Wed")]
f=0
for s,want in C:
    got=days_of(s)[0]
    if got!=want: f+=1; print('FAIL',repr(s),got,'want',want)
print(f"test_days: {len(C)-f} pass {f} fail"); sys.exit(1 if f else 0)
