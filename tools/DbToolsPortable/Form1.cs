using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

namespace DbToolsPortable;

public partial class Form1 : Form
{
    private const string ReminderTaskPrefix = "SuiviProjet-SharePoint-Reminder";
    private const string DefaultSharepointUrl = "https://solutions300-my.sharepoint.com/:x:/r/personal/mathieu_duclos_solutions30_com/_layouts/15/doc2.aspx?sourcedoc=%7B7A33CE52-DF71-4E18-B6EA-DAC96761B2FC%7D&file=SAIP%20-%20Suivi%20ventes%20&%20AO_VF.xlsx=&fromShare=true&action=default&mobileredirect=true";
    private const string DashboardUrl = "https://suivi4me.netlify.app/";

    public Form1()
    {
        InitializeComponent();
        ApplyVisualTheme();
        WireEvents();
        InitState();
    }

    private void ApplyVisualTheme()
    {
        var bg = Color.FromArgb(10, 18, 32);
        var panel = Color.FromArgb(16, 28, 46);
        var panelAlt = Color.FromArgb(13, 23, 40);
        var text = Color.FromArgb(235, 246, 255);
        var muted = Color.FromArgb(178, 205, 230);
        var border = Color.FromArgb(34, 60, 93);
        var accent = Color.FromArgb(0, 176, 140);
        var warn = Color.FromArgb(214, 122, 47);
        var info = Color.FromArgb(0, 125, 198);

        BackColor = bg;
        ForeColor = text;
        lblTitle.ForeColor = text;
        lblTitle.Font = new Font("Segoe UI Semibold", 16f, FontStyle.Bold);

        var groups = new[] { grpWorkspace, grpDatabase, grpImport, grpSharepoint, grpReminder };
        foreach (var g in groups)
        {
            g.ForeColor = text;
            g.BackColor = panel;
            g.Font = new Font("Segoe UI Semibold", 10f, FontStyle.Bold);
        }

        var textBoxes = new[] { txtWorkspace, txtDbUrl, txtDatasetKey, txtExcelPath, txtSharepointUrl, txtLog };
        foreach (var tb in textBoxes)
        {
            tb.BackColor = panelAlt;
            tb.ForeColor = text;
            tb.BorderStyle = BorderStyle.FixedSingle;
            tb.Font = tb == txtLog ? new Font("Consolas", 9.6f, FontStyle.Regular) : new Font("Segoe UI", 10f, FontStyle.Regular);
        }

        txtLog.BackColor = Color.FromArgb(8, 14, 26);

        var primaryButtons = new[] { btnSaveDbUrl, btnTestDb, btnImport, btnSetReminder, btnOpenSharepointUrl };
        foreach (var b in primaryButtons) StyleButton(b, accent, text, border);

        var neutralButtons = new[] { btnBrowseWorkspace, btnDetectWorkspace, btnLoadDbUrl, btnBrowseExcel, btnSaveSharepointUrl, btnShowReminder, btnClearLog };
        foreach (var b in neutralButtons) StyleButton(b, info, text, border);

        var dangerButtons = new[] { btnClearDbUrl, btnClearReminder };
        foreach (var b in dangerButtons) StyleButton(b, warn, text, border);

        dtpReminderTime.CalendarMonthBackground = panelAlt;
        dtpReminderTime.CalendarForeColor = text;
        dtpReminderTime.CalendarTitleBackColor = Color.FromArgb(22, 40, 64);
        dtpReminderTime.CalendarTitleForeColor = text;
        dtpReminderTime.Font = new Font("Segoe UI", 10f, FontStyle.Regular);

        txtDatasetKey.PlaceholderText = "dataset key (ex: saip-main)";
        txtExcelPath.PlaceholderText = "Choisir le fichier Excel/CSV a importer";
        txtWorkspace.PlaceholderText = "Dossier du projet";
    }

    private static void StyleButton(Button button, Color fill, Color text, Color border)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.BorderColor = border;
        button.BackColor = fill;
        button.ForeColor = text;
        button.Font = new Font("Segoe UI Semibold", 9f, FontStyle.Bold);
        button.Height = Math.Max(button.Height, 28);
        button.UseVisualStyleBackColor = false;
    }

    private void WireEvents()
    {
        btnBrowseWorkspace.Click += (_, _) => BrowseWorkspace();
        btnDetectWorkspace.Click += (_, _) => DetectWorkspace();

        btnSaveDbUrl.Click += async (_, _) => await RunActionAsync("Enregistrement URL DB", SaveDbUrlAsync);
        btnLoadDbUrl.Click += (_, _) => LoadDbUrlToTextbox();
        btnClearDbUrl.Click += async (_, _) => await RunActionAsync("Suppression URL DB", ClearDbUrlAsync);
        btnTestDb.Click += async (_, _) => await RunActionAsync("Test connexion DB", TestDbAsync);

        btnBrowseExcel.Click += (_, _) => BrowseExcel();
        btnImport.Click += async (_, _) => await RunActionAsync("Import Excel", ImportAsync);

        btnSaveSharepointUrl.Click += (_, _) => SaveSharepointUrl();
        btnOpenSharepointUrl.Click += (_, _) => OpenSharepointUrl();

        btnSetReminder.Click += async (_, _) => await RunActionAsync("Programmation rappel", SetReminderAsync);
        btnShowReminder.Click += async (_, _) => await RunActionAsync("Etat rappel", ShowReminderAsync);
        btnClearReminder.Click += async (_, _) => await RunActionAsync("Suppression rappel", ClearReminderAsync);

        btnClearLog.Click += (_, _) => txtLog.Clear();
    }

    private void InitState()
    {
        txtWorkspace.Text = DetectWorkspacePath() ?? Environment.CurrentDirectory;
        txtSharepointUrl.Text = ReadSharepointUrl();
        LoadDbUrlToTextbox();
        dtpReminderTime.Value = DateTime.Today.AddHours(9);
        AppendLog("Application prête.");
    }

    private async Task RunActionAsync(string label, Func<Task> action)
    {
        try
        {
            ToggleBusy(true);
            AppendLog($"== {label} ==");
            await action();
            AppendLog($"OK: {label} terminé.");
        }
        catch (Exception ex)
        {
            AppendLog($"ERREUR: {ex.Message}");
        }
        finally
        {
            ToggleBusy(false);
        }
    }

    private void ToggleBusy(bool busy)
    {
        UseWaitCursor = busy;
        foreach (Control c in Controls)
        {
            c.Enabled = !busy;
        }
        rootLayout.Enabled = !busy;
        Cursor = busy ? Cursors.WaitCursor : Cursors.Default;
    }

    private void AppendLog(string line)
    {
        var stamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
        txtLog.AppendText($"[{stamp}] {line}{Environment.NewLine}");
    }

    private void BrowseWorkspace()
    {
        using var dlg = new FolderBrowserDialog
        {
            Description = "Sélectionne le dossier racine du projet",
            ShowNewFolderButton = false
        };
        if (dlg.ShowDialog(this) == DialogResult.OK)
        {
            txtWorkspace.Text = dlg.SelectedPath;
        }
    }

    private void DetectWorkspace()
    {
        txtWorkspace.Text = DetectWorkspacePath() ?? txtWorkspace.Text;
        AppendLog($"Workspace détecté: {txtWorkspace.Text}");
    }

    private static string? DetectWorkspacePath()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            var probe = Path.Combine(current.FullName, "scripts", "import_excel_picker.js");
            if (File.Exists(probe))
            {
                return current.FullName;
            }
            current = current.Parent;
        }
        return null;
    }

    private static string GetAppDataDir()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SuiviProjet");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string DbSecretPath => Path.Combine(GetAppDataDir(), "neon_db_url.dpapi");
    private static string SharepointUrlPath => Path.Combine(GetAppDataDir(), "sharepoint_source_url.txt");

    private Task SaveDbUrlAsync()
    {
        var url = (txtDbUrl.Text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(url))
        {
            throw new InvalidOperationException("URL DB vide.");
        }
        WriteDbUrlSecret(url);
        AppendLog("URL DB enregistrée en stockage sécurisé Windows.");
        return Task.CompletedTask;
    }

    private static void WriteDbUrlSecret(string url)
    {
        var raw = Encoding.UTF8.GetBytes(url);
        var protectedBytes = ProtectedData.Protect(raw, null, DataProtectionScope.CurrentUser);
        File.WriteAllText(DbSecretPath, Convert.ToBase64String(protectedBytes), Encoding.ASCII);
    }

    private static string? ReadDbUrlSecret()
    {
        if (!File.Exists(DbSecretPath)) return null;
        try
        {
            var b64 = File.ReadAllText(DbSecretPath, Encoding.ASCII).Trim();
            if (string.IsNullOrWhiteSpace(b64)) return null;
            var protectedBytes = Convert.FromBase64String(b64);
            var raw = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(raw);
        }
        catch
        {
            // Fallback compat: ancien format chiffré PowerShell ConvertFrom-SecureString.
            var legacy = TryReadLegacyDbUrlWithPowerShell(DbSecretPath);
            if (!string.IsNullOrWhiteSpace(legacy))
            {
                try { WriteDbUrlSecret(legacy); } catch { /* no-op */ }
                return legacy;
            }
            return null;
        }
    }

    private static string? TryReadLegacyDbUrlWithPowerShell(string path)
    {
        try
        {
            var escaped = path.Replace("'", "''");
            var ps = "$c=(Get-Content -LiteralPath '" + escaped + "' -Raw).Trim(); " +
                     "if([string]::IsNullOrWhiteSpace($c)){exit 0}; " +
                     "$s=ConvertTo-SecureString -String $c; " +
                     "$b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); " +
                     "try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}";

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"" + ps.Replace("\"", "\\\"") + "\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var process = Process.Start(psi);
            if (process is null) return null;
            var output = process.StandardOutput.ReadToEnd().Trim();
            process.WaitForExit();
            return string.IsNullOrWhiteSpace(output) ? null : output;
        }
        catch
        {
            return null;
        }
    }

    private void LoadDbUrlToTextbox()
    {
        var url = ReadDbUrlSecret();
        if (string.IsNullOrWhiteSpace(url))
        {
            AppendLog("Aucune URL DB sécurisée trouvée.");
            return;
        }
        txtDbUrl.Text = url;
        AppendLog("URL DB relue depuis le stockage sécurisé.");
    }

    private Task ClearDbUrlAsync()
    {
        if (File.Exists(DbSecretPath))
        {
            File.Delete(DbSecretPath);
            AppendLog("URL DB sécurisée supprimée.");
        }
        else
        {
            AppendLog("Aucune URL DB à supprimer.");
        }
        return Task.CompletedTask;
    }

    private void BrowseExcel()
    {
        using var dlg = new OpenFileDialog
        {
            Filter = "Excel/CSV (*.xlsx;*.csv)|*.xlsx;*.csv|Excel (*.xlsx)|*.xlsx|CSV (*.csv)|*.csv|Tous fichiers (*.*)|*.*",
            CheckFileExists = true,
            CheckPathExists = true,
            Multiselect = false
        };
        if (dlg.ShowDialog(this) == DialogResult.OK)
        {
            txtExcelPath.Text = dlg.FileName;
        }
    }

    private async Task TestDbAsync()
    {
        var workspace = EnsureWorkspace();
        var dbUrl = EnsureDbUrl();
        var result = await RunProcessAsync(
            "node",
            "scripts/test_db_connection.js",
            workspace,
            new Dictionary<string, string> { ["NEON_DATABASE_URL"] = dbUrl }
        );
        AppendProcessResult(result);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException("Test DB en erreur.");
        }
    }

    private async Task ImportAsync()
    {
        var workspace = EnsureWorkspace();
        var dbUrl = EnsureDbUrl();
        var excelPath = (txtExcelPath.Text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(excelPath) || !File.Exists(excelPath))
        {
            throw new InvalidOperationException("Fichier Excel/CSV introuvable.");
        }

        var datasetKey = (txtDatasetKey.Text ?? "saip-main").Trim();
        if (string.IsNullOrWhiteSpace(datasetKey)) datasetKey = "saip-main";

        var args = $"scripts/import_excel_picker.js \"{excelPath}\" \"{datasetKey}\" \"db-tools-gui\"";
        var result = await RunProcessAsync(
            "node",
            args,
            workspace,
            new Dictionary<string, string> { ["NEON_DATABASE_URL"] = dbUrl }
        );
        AppendProcessResult(result);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException("Import en erreur.");
        }
    }

    private static string ReadSharepointUrl()
    {
        if (!File.Exists(SharepointUrlPath)) return DefaultSharepointUrl;
        var value = File.ReadAllText(SharepointUrlPath, Encoding.UTF8).Trim();
        return string.IsNullOrWhiteSpace(value) ? DefaultSharepointUrl : value;
    }

    private void SaveSharepointUrl()
    {
        var url = (txtSharepointUrl.Text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(url))
        {
            MessageBox.Show(this, "URL SharePoint vide.", "Information", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        File.WriteAllText(SharepointUrlPath, url, Encoding.UTF8);
        AppendLog("URL SharePoint enregistrée.");
    }

    private void OpenSharepointUrl()
    {
        var url = (txtSharepointUrl.Text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(url))
        {
            url = ReadSharepointUrl();
            txtSharepointUrl.Text = url;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = url,
            UseShellExecute = true
        });
        AppendLog("URL SharePoint ouverte dans le navigateur.");
    }

    private async Task SetReminderAsync()
    {
        var exePath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(exePath))
        {
            throw new InvalidOperationException("Chemin EXE introuvable.");
        }

        SaveSharepointUrl();
        var hhmm = dtpReminderTime.Value.ToString("HH:mm");
        var taskName = BuildReminderTaskName(dtpReminderTime.Value);
        var tr = $"\\\"{exePath}\\\" --open-sharepoint";
        var args = $"/Create /SC DAILY /TN \"{taskName}\" /TR \"{tr}\" /ST {hhmm} /F";
        var result = await RunProcessAsync("schtasks", args, Environment.CurrentDirectory, null);
        AppendProcessResult(result);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException("Impossible de programmer le rappel.");
        }
        AppendLog($"Rappel créé: {taskName} à {hhmm}");
    }

    private async Task ShowReminderAsync()
    {
        var tasks = await GetReminderTasksAsync();
        if (tasks.Count == 0)
        {
            AppendLog("Aucun rappel configuré.");
            return;
        }
        AppendLog($"Rappels détectés: {tasks.Count}");
        foreach (var task in tasks.OrderBy(t => t))
        {
            AppendLog($"- {task}");
        }
    }

    private async Task ClearReminderAsync()
    {
        var tasks = await GetReminderTasksAsync();
        if (tasks.Count == 0)
        {
            AppendLog("Aucun rappel à supprimer.");
            return;
        }

        var selected = PromptTaskSelection(tasks, "Supprimer un rappel", "Choisis le rappel à supprimer :");
        if (string.IsNullOrWhiteSpace(selected))
        {
            AppendLog("Suppression annulée.");
            return;
        }

        var args = $"/Delete /TN \"{selected}\" /F";
        var result = await RunProcessAsync("schtasks", args, Environment.CurrentDirectory, null);
        if (result.ExitCode != 0)
        {
            AppendLog($"Impossible de supprimer le rappel: {selected}");
            return;
        }
        AppendProcessResult(result);
    }

    private static string BuildReminderTaskName(DateTime scheduledAt)
    {
        return $"{ReminderTaskPrefix}-{scheduledAt:HHmm}-{DateTime.Now:yyyyMMddHHmmss}";
    }

    private async Task<List<string>> GetReminderTasksAsync()
    {
        var result = await RunProcessAsync("schtasks", "/Query /FO CSV /NH", Environment.CurrentDirectory, null);
        if (result.ExitCode != 0 || string.IsNullOrWhiteSpace(result.StdOut))
        {
            return new List<string>();
        }

        var tasks = new List<string>();
        var lines = result.StdOut.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
        foreach (var rawLine in lines)
        {
            var first = ParseCsvFirstField(rawLine);
            if (string.IsNullOrWhiteSpace(first)) continue;
            var taskName = first.Trim().Trim('"').Trim();
            taskName = taskName.TrimStart('\\');
            if (taskName.StartsWith(ReminderTaskPrefix, StringComparison.OrdinalIgnoreCase))
            {
                tasks.Add(taskName);
            }
        }
        return tasks.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static string ParseCsvFirstField(string line)
    {
        if (string.IsNullOrEmpty(line)) return string.Empty;
        var sb = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    sb.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
                continue;
            }
            if (c == ',' && !inQuotes) break;
            sb.Append(c);
        }
        return sb.ToString();
    }

    private string? PromptTaskSelection(List<string> tasks, string title, string message)
    {
        using var dlg = new Form();
        dlg.Text = title;
        dlg.StartPosition = FormStartPosition.CenterParent;
        dlg.Size = new Size(720, 420);
        dlg.MinimizeBox = false;
        dlg.MaximizeBox = false;
        dlg.FormBorderStyle = FormBorderStyle.FixedDialog;
        dlg.BackColor = Color.FromArgb(10, 18, 32);
        dlg.ForeColor = Color.FromArgb(235, 246, 255);

        var lbl = new Label
        {
            Text = message,
            Dock = DockStyle.Top,
            Height = 36
        };
        var list = new ListBox
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(13, 23, 40),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10f, FontStyle.Regular)
        };
        list.Items.AddRange(tasks.OrderBy(t => t).Cast<object>().ToArray());
        if (list.Items.Count > 0) list.SelectedIndex = 0;

        var panel = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 46,
            FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(8)
        };
        var btnCancel = new Button { Text = "Annuler", DialogResult = DialogResult.Cancel, Width = 110, Height = 28 };
        var btnOk = new Button { Text = "Supprimer", DialogResult = DialogResult.OK, Width = 110, Height = 28 };
        btnOk.FlatStyle = FlatStyle.Flat;
        btnOk.BackColor = Color.FromArgb(214, 122, 47);
        btnOk.ForeColor = Color.White;
        btnCancel.FlatStyle = FlatStyle.Flat;
        btnCancel.BackColor = Color.FromArgb(0, 125, 198);
        btnCancel.ForeColor = Color.White;
        panel.Controls.Add(btnOk);
        panel.Controls.Add(btnCancel);

        dlg.Controls.Add(list);
        dlg.Controls.Add(panel);
        dlg.Controls.Add(lbl);
        dlg.AcceptButton = btnOk;
        dlg.CancelButton = btnCancel;

        var result = dlg.ShowDialog(this);
        if (result != DialogResult.OK || list.SelectedItem is null) return null;
        return list.SelectedItem.ToString();
    }

    private static async Task<ProcessResult> RunProcessAsync(string fileName, string arguments, string workingDirectory, IDictionary<string, string>? env)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        if (env is not null)
        {
            foreach (var kv in env)
            {
                psi.Environment[kv.Key] = kv.Value;
            }
        }

        using var process = new Process { StartInfo = psi };
        var output = new StringBuilder();
        var error = new StringBuilder();

        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is not null) output.AppendLine(e.Data);
        };
        process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null) error.AppendLine(e.Data);
        };

        if (!process.Start())
        {
            throw new InvalidOperationException($"Impossible de démarrer: {fileName}");
        }

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        await process.WaitForExitAsync();

        return new ProcessResult(process.ExitCode, output.ToString(), error.ToString(), fileName + " " + arguments);
    }

    private void AppendProcessResult(ProcessResult result)
    {
        AppendLog("Commande: " + result.CommandLine);
        if (!string.IsNullOrWhiteSpace(result.StdOut)) AppendLog(result.StdOut.Trim());
        if (!string.IsNullOrWhiteSpace(result.StdErr)) AppendLog(result.StdErr.Trim());
        AppendLog("Code retour: " + result.ExitCode);
    }

    private string EnsureWorkspace()
    {
        var workspace = (txtWorkspace.Text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(workspace) || !Directory.Exists(workspace))
        {
            throw new InvalidOperationException("Workspace invalide.");
        }
        var importer = Path.Combine(workspace, "scripts", "import_excel_picker.js");
        if (!File.Exists(importer))
        {
            throw new InvalidOperationException("Script scripts/import_excel_picker.js introuvable dans le workspace.");
        }
        return workspace;
    }

    private string EnsureDbUrl()
    {
        var url = (txtDbUrl.Text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(url))
        {
            url = ReadDbUrlSecret() ?? string.Empty;
        }
        if (string.IsNullOrWhiteSpace(url))
        {
            throw new InvalidOperationException("URL DB absente. Enregistre-la d'abord.");
        }
        return url;
    }

    public static bool HandleCliArgsAndExitIfNeeded(string[] args)
    {
        if (args.Any(a => string.Equals(a, "--open-sharepoint", StringComparison.OrdinalIgnoreCase)))
        {
            var exePath = Environment.ProcessPath;
            if (!string.IsNullOrWhiteSpace(exePath))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = exePath,
                    UseShellExecute = true
                });
            }

            var url = ReadSharepointUrl();
            var message =
                "Rappel import donnees\n\n" +
                "Le fichier SharePoint et le dashboard web vont s'ouvrir.\n" +
                "Continuer ?";

            var answer = MessageBox.Show(
                message,
                "DB Tools - Rappel",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Information,
                MessageBoxDefaultButton.Button1,
                MessageBoxOptions.DefaultDesktopOnly
            );

            if (answer == DialogResult.Yes)
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
                Process.Start(new ProcessStartInfo
                {
                    FileName = DashboardUrl,
                    UseShellExecute = true
                });
            }
            return true;
        }
        return false;
    }

    private readonly record struct ProcessResult(int ExitCode, string StdOut, string StdErr, string CommandLine);
}
