# Automatic Drive backup (every 15 minutes)

A small Google Apps Script copies Nikhil's World to Google Drive on its own, every 15 minutes, even when
the app isn't open. It runs under your own Google account and holds no keys or passwords.

What it does each time:

- Checks whether anything in the app changed since the last backup (it downloads only the "last changed"
  time of each item). If nothing changed, it stops there and writes nothing.
- If something changed, it reads everything and saves one file to the **Nikhil's World Backups** folder
  in Drive, named like `nikhil-world-backup-2026-10-04-AKDT.json` (the date and time zone of the device
  you last opened the app on; Alaska time if it doesn't know yet).
- It checks Drive has the whole file, and only then moves older files with **exactly the same name** to
  Drive's trash (you can get them back from the trash for 30 days). It never deletes folders, never touches
  any other file in that folder, and never touches the older backups whose names have no time zone.
- It never changes anything in the app's database.

The files are the same kind of file the app's **Sync to Drive** button writes, so **Restore from backup**
on the System tab can read them.

Do this once, on a laptop or desktop browser (it takes about 10 minutes). You need the two files from this
repo: `tools/drive-backup.gs` and `tools/appsscript.json`.

## Set it up

1. Sign in to Google in your browser with the account that owns the app's Firebase project
   (the same account you use for "Sync to Drive").
2. Go to **https://script.google.com** and click **New project** (top left).
3. Click **Untitled project** at the top and rename it **Nikhil's World backup**. Click **Rename**.
4. Show the settings file:
   1. Click the **gear icon** (Project Settings) on the left.
   2. Tick **Show "appsscript.json" manifest file in editor**.
   3. Click the **< >** icon (Editor) on the left to go back.
5. Paste the settings file:
   1. In the file list on the left, click **appsscript.json**.
   2. Select everything in it (Ctrl+A, or Cmd+A on a Mac) and delete it.
   3. Open `tools/appsscript.json` from this repo, copy all of it, and paste it in.
6. Paste the script:
   1. In the file list, click **Code.gs**.
   2. Select everything in it and delete it.
   3. Open `tools/drive-backup.gs` from this repo, copy all of it, and paste it in.
7. Click the **Save** icon (the floppy disk) above the code, or press Ctrl+S (Cmd+S on a Mac).
8. Run one backup now:
   1. In the bar above the code, open the function menu (it shows the name of a function) and choose
      **runBackup**.
   2. Click **Run**.
9. Approve the permission screens (they appear only the first time):
   1. **Authorization required** → click **Review permissions**.
   2. Choose your Google account.
   3. You will see **Google hasn't verified this app**. This is expected: the script is yours, it was
      never sent to Google for review, and only you use it. Click **Advanced**, then
      **Go to Nikhil's World backup (unsafe)**.
   4. The next screen lists what the script may do: see and change your Google Drive files (to save the
      backup and move the older same-name copy to the trash), view and manage your Google Cloud Datastore
      data (to read the app's database; it never writes to it), connect to an external service (to call
      the database), and allow this application to run when you are not present (the timer). Click
      **Allow**.
10. Look at the **Execution log** at the bottom. It should end with a line like
    `Backed up 31 keys to "Nikhil's World Backups/nikhil-world-backup-2026-10-04-AKDT.json".`
    If it shows an error instead, see "If something goes wrong" below.
11. Check the file is there: open **https://drive.google.com**, open the **Nikhil's World Backups** folder,
    and look for the file with today's date.
12. Turn on the timer:
    1. In the function menu, choose **setupTrigger**.
    2. Click **Run**. The log says `Timer set up: runBackup every 15 minutes.`
       (Running it again is safe: it says the timer was already set up and never adds a second one.)
13. Check there is exactly one timer: click the **alarm clock icon** (Triggers) on the left. You should see
    one row: function **runBackup**, event **Time-based**, **Every 15 minutes**. If there are two, delete
    one with the three-dot menu on its row.

That's it. Each run appears under **Executions** (the list icon on the left), so you can see when it last
ran and whether it wrote a file ("No changes since the last backup" means nothing had changed).

## If something goes wrong

**The log says `Firestore said 403` and `PERMISSION_DENIED` (or "Missing or insufficient permissions", or
"Caller does not have required permission to use project nikhils-world").**
The Google account running the script can't read the app's database.

1. Make sure you approved the permission screens with the account that owns the Firebase project. To check
   which account the script uses, click your picture at the top right of script.google.com.
2. Open **https://console.cloud.google.com/iam-admin/iam?project=nikhils-world** with that account. Find
   your email in the list. Its role must be **Owner**, **Editor**, or **Cloud Datastore User**. If your
   email isn't there, click **Grant access**, enter it, pick the role **Cloud Datastore User**, and click
   **Save**. (Also give it **Service Usage Consumer** if the message mentions "serviceusage".)
3. Run **runBackup** again.

**The log says `Firestore said 403` with `SERVICE_DISABLED`, "API has not been used in project … before or
it is disabled", or "Cloud Firestore API has not been used".**
The Firestore API is turned off for the project named in the message.

1. If the message names **nikhils-world** (or its number, 55888993304): open
   **https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=nikhils-world**
   and click **Enable**.
2. If the message names a different project number, it is the script's own hidden project. Open the link
   in the message (it ends in that project number) and click **Enable** there too.
3. Wait two minutes, then run **runBackup** again.

**The log says `Firestore said 401`.** The sign-in is out of date. Run **runBackup** again; if a permission
screen appears, approve it as in step 9.

**The log says "Drive's copy … does not match".** The upload didn't finish properly. Nothing older was
moved to the trash. It tries again at the next run; you can also run **runBackup** again by hand.

**You want to stop it.** Open **Triggers** (the alarm clock icon), click the three-dot menu on the
runBackup row, and choose **Delete trigger**. The backup files already in Drive stay where they are.
