namespace DbToolsPortable;

partial class Form1
{
    /// <summary>
    ///  Required designer variable.
    /// </summary>
    private System.ComponentModel.IContainer components = null!;

    /// <summary>
    ///  Clean up any resources being used.
    /// </summary>
    /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

    private System.Windows.Forms.TableLayoutPanel rootLayout = null!;
    private System.Windows.Forms.Label lblTitle = null!;
    private System.Windows.Forms.GroupBox grpWorkspace = null!;
    private System.Windows.Forms.TextBox txtWorkspace = null!;
    private System.Windows.Forms.Button btnBrowseWorkspace = null!;
    private System.Windows.Forms.Button btnDetectWorkspace = null!;
    private System.Windows.Forms.GroupBox grpDatabase = null!;
    private System.Windows.Forms.TextBox txtDbUrl = null!;
    private System.Windows.Forms.Button btnSaveDbUrl = null!;
    private System.Windows.Forms.Button btnLoadDbUrl = null!;
    private System.Windows.Forms.Button btnClearDbUrl = null!;
    private System.Windows.Forms.Button btnTestDb = null!;
    private System.Windows.Forms.GroupBox grpImport = null!;
    private System.Windows.Forms.TextBox txtDatasetKey = null!;
    private System.Windows.Forms.TextBox txtExcelPath = null!;
    private System.Windows.Forms.Button btnBrowseExcel = null!;
    private System.Windows.Forms.Button btnImport = null!;
    private System.Windows.Forms.GroupBox grpSharepoint = null!;
    private System.Windows.Forms.TextBox txtSharepointUrl = null!;
    private System.Windows.Forms.Button btnSaveSharepointUrl = null!;
    private System.Windows.Forms.Button btnOpenSharepointUrl = null!;
    private System.Windows.Forms.GroupBox grpReminder = null!;
    private System.Windows.Forms.DateTimePicker dtpReminderTime = null!;
    private System.Windows.Forms.Button btnSetReminder = null!;
    private System.Windows.Forms.Button btnShowReminder = null!;
    private System.Windows.Forms.Button btnClearReminder = null!;
    private System.Windows.Forms.TextBox txtLog = null!;
    private System.Windows.Forms.Button btnClearLog = null!;

    /// <summary>
    ///  Required method for Designer support - do not modify
    ///  the contents of this method with the code editor.
    /// </summary>
    private void InitializeComponent()
    {
        this.rootLayout = new System.Windows.Forms.TableLayoutPanel();
        this.lblTitle = new System.Windows.Forms.Label();
        this.grpWorkspace = new System.Windows.Forms.GroupBox();
        this.txtWorkspace = new System.Windows.Forms.TextBox();
        this.btnBrowseWorkspace = new System.Windows.Forms.Button();
        this.btnDetectWorkspace = new System.Windows.Forms.Button();
        this.grpDatabase = new System.Windows.Forms.GroupBox();
        this.txtDbUrl = new System.Windows.Forms.TextBox();
        this.btnSaveDbUrl = new System.Windows.Forms.Button();
        this.btnLoadDbUrl = new System.Windows.Forms.Button();
        this.btnClearDbUrl = new System.Windows.Forms.Button();
        this.btnTestDb = new System.Windows.Forms.Button();
        this.grpImport = new System.Windows.Forms.GroupBox();
        this.txtDatasetKey = new System.Windows.Forms.TextBox();
        this.txtExcelPath = new System.Windows.Forms.TextBox();
        this.btnBrowseExcel = new System.Windows.Forms.Button();
        this.btnImport = new System.Windows.Forms.Button();
        this.grpSharepoint = new System.Windows.Forms.GroupBox();
        this.txtSharepointUrl = new System.Windows.Forms.TextBox();
        this.btnSaveSharepointUrl = new System.Windows.Forms.Button();
        this.btnOpenSharepointUrl = new System.Windows.Forms.Button();
        this.grpReminder = new System.Windows.Forms.GroupBox();
        this.dtpReminderTime = new System.Windows.Forms.DateTimePicker();
        this.btnSetReminder = new System.Windows.Forms.Button();
        this.btnShowReminder = new System.Windows.Forms.Button();
        this.btnClearReminder = new System.Windows.Forms.Button();
        this.txtLog = new System.Windows.Forms.TextBox();
        this.btnClearLog = new System.Windows.Forms.Button();
        this.rootLayout.SuspendLayout();
        this.grpWorkspace.SuspendLayout();
        this.grpDatabase.SuspendLayout();
        this.grpImport.SuspendLayout();
        this.grpSharepoint.SuspendLayout();
        this.grpReminder.SuspendLayout();
        this.SuspendLayout();
        // 
        // rootLayout
        // 
        this.rootLayout.ColumnCount = 1;
        this.rootLayout.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 100F));
        this.rootLayout.Controls.Add(this.lblTitle, 0, 0);
        this.rootLayout.Controls.Add(this.grpWorkspace, 0, 1);
        this.rootLayout.Controls.Add(this.grpDatabase, 0, 2);
        this.rootLayout.Controls.Add(this.grpImport, 0, 3);
        this.rootLayout.Controls.Add(this.grpSharepoint, 0, 4);
        this.rootLayout.Controls.Add(this.grpReminder, 0, 5);
        this.rootLayout.Controls.Add(this.txtLog, 0, 6);
        this.rootLayout.Controls.Add(this.btnClearLog, 0, 7);
        this.rootLayout.Dock = System.Windows.Forms.DockStyle.Fill;
        this.rootLayout.Location = new System.Drawing.Point(10, 10);
        this.rootLayout.Name = "rootLayout";
        this.rootLayout.RowCount = 8;
        this.rootLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 44F));
        this.rootLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 70F));
        this.rootLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 96F));
        this.rootLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 86F));
        this.rootLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 80F));
        this.rootLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 74F));
        this.rootLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Percent, 100F));
        this.rootLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 40F));
        this.rootLayout.Size = new System.Drawing.Size(1004, 711);
        this.rootLayout.TabIndex = 0;
        // 
        // lblTitle
        // 
        this.lblTitle.AutoSize = true;
        this.lblTitle.Dock = System.Windows.Forms.DockStyle.Fill;
        this.lblTitle.Font = new System.Drawing.Font("Segoe UI Semibold", 14F, System.Drawing.FontStyle.Bold);
        this.lblTitle.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(230)))), ((int)(((byte)(244)))), ((int)(((byte)(255)))));
        this.lblTitle.Location = new System.Drawing.Point(3, 0);
        this.lblTitle.Name = "lblTitle";
        this.lblTitle.Size = new System.Drawing.Size(998, 44);
        this.lblTitle.TabIndex = 0;
        this.lblTitle.Text = "DB Tools Portable - Import Excel + SharePoint";
        this.lblTitle.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
        // 
        // grpWorkspace
        // 
        this.grpWorkspace.Controls.Add(this.txtWorkspace);
        this.grpWorkspace.Controls.Add(this.btnBrowseWorkspace);
        this.grpWorkspace.Controls.Add(this.btnDetectWorkspace);
        this.grpWorkspace.Dock = System.Windows.Forms.DockStyle.Fill;
        this.grpWorkspace.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(200)))), ((int)(((byte)(230)))), ((int)(((byte)(250)))));
        this.grpWorkspace.Location = new System.Drawing.Point(3, 47);
        this.grpWorkspace.Name = "grpWorkspace";
        this.grpWorkspace.Size = new System.Drawing.Size(998, 64);
        this.grpWorkspace.TabIndex = 1;
        this.grpWorkspace.TabStop = false;
        this.grpWorkspace.Text = "Dossier du projet (workspace)";
        // 
        // txtWorkspace
        // 
        this.txtWorkspace.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(16)))), ((int)(((byte)(29)))), ((int)(((byte)(46)))));
        this.txtWorkspace.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
        this.txtWorkspace.ForeColor = System.Drawing.Color.White;
        this.txtWorkspace.Location = new System.Drawing.Point(10, 24);
        this.txtWorkspace.Name = "txtWorkspace";
        this.txtWorkspace.Size = new System.Drawing.Size(726, 23);
        this.txtWorkspace.TabIndex = 0;
        // 
        // btnBrowseWorkspace
        // 
        this.btnBrowseWorkspace.Location = new System.Drawing.Point(746, 23);
        this.btnBrowseWorkspace.Name = "btnBrowseWorkspace";
        this.btnBrowseWorkspace.Size = new System.Drawing.Size(109, 25);
        this.btnBrowseWorkspace.TabIndex = 1;
        this.btnBrowseWorkspace.Text = "Parcourir";
        this.btnBrowseWorkspace.UseVisualStyleBackColor = true;
        // 
        // btnDetectWorkspace
        // 
        this.btnDetectWorkspace.Location = new System.Drawing.Point(863, 23);
        this.btnDetectWorkspace.Name = "btnDetectWorkspace";
        this.btnDetectWorkspace.Size = new System.Drawing.Size(126, 25);
        this.btnDetectWorkspace.TabIndex = 2;
        this.btnDetectWorkspace.Text = "Auto-detecter";
        this.btnDetectWorkspace.UseVisualStyleBackColor = true;
        // 
        // grpDatabase
        // 
        this.grpDatabase.Controls.Add(this.txtDbUrl);
        this.grpDatabase.Controls.Add(this.btnSaveDbUrl);
        this.grpDatabase.Controls.Add(this.btnLoadDbUrl);
        this.grpDatabase.Controls.Add(this.btnClearDbUrl);
        this.grpDatabase.Controls.Add(this.btnTestDb);
        this.grpDatabase.Dock = System.Windows.Forms.DockStyle.Fill;
        this.grpDatabase.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(200)))), ((int)(((byte)(230)))), ((int)(((byte)(250)))));
        this.grpDatabase.Location = new System.Drawing.Point(3, 117);
        this.grpDatabase.Name = "grpDatabase";
        this.grpDatabase.Size = new System.Drawing.Size(998, 90);
        this.grpDatabase.TabIndex = 2;
        this.grpDatabase.TabStop = false;
        this.grpDatabase.Text = "Connexion DB (stockage sécurisé local)";
        // 
        // txtDbUrl
        // 
        this.txtDbUrl.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(16)))), ((int)(((byte)(29)))), ((int)(((byte)(46)))));
        this.txtDbUrl.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
        this.txtDbUrl.ForeColor = System.Drawing.Color.White;
        this.txtDbUrl.Location = new System.Drawing.Point(10, 25);
        this.txtDbUrl.Name = "txtDbUrl";
        this.txtDbUrl.Size = new System.Drawing.Size(979, 23);
        this.txtDbUrl.TabIndex = 0;
        // 
        // btnSaveDbUrl
        // 
        this.btnSaveDbUrl.Location = new System.Drawing.Point(10, 56);
        this.btnSaveDbUrl.Name = "btnSaveDbUrl";
        this.btnSaveDbUrl.Size = new System.Drawing.Size(170, 25);
        this.btnSaveDbUrl.TabIndex = 1;
        this.btnSaveDbUrl.Text = "Enregistrer (sécurisé)";
        this.btnSaveDbUrl.UseVisualStyleBackColor = true;
        // 
        // btnLoadDbUrl
        // 
        this.btnLoadDbUrl.Location = new System.Drawing.Point(188, 56);
        this.btnLoadDbUrl.Name = "btnLoadDbUrl";
        this.btnLoadDbUrl.Size = new System.Drawing.Size(150, 25);
        this.btnLoadDbUrl.TabIndex = 2;
        this.btnLoadDbUrl.Text = "Relire l'URL";
        this.btnLoadDbUrl.UseVisualStyleBackColor = true;
        // 
        // btnClearDbUrl
        // 
        this.btnClearDbUrl.Location = new System.Drawing.Point(346, 56);
        this.btnClearDbUrl.Name = "btnClearDbUrl";
        this.btnClearDbUrl.Size = new System.Drawing.Size(150, 25);
        this.btnClearDbUrl.TabIndex = 3;
        this.btnClearDbUrl.Text = "Supprimer";
        this.btnClearDbUrl.UseVisualStyleBackColor = true;
        // 
        // btnTestDb
        // 
        this.btnTestDb.Location = new System.Drawing.Point(502, 56);
        this.btnTestDb.Name = "btnTestDb";
        this.btnTestDb.Size = new System.Drawing.Size(180, 25);
        this.btnTestDb.TabIndex = 4;
        this.btnTestDb.Text = "Tester connexion";
        this.btnTestDb.UseVisualStyleBackColor = true;
        // 
        // grpImport
        // 
        this.grpImport.Controls.Add(this.txtDatasetKey);
        this.grpImport.Controls.Add(this.txtExcelPath);
        this.grpImport.Controls.Add(this.btnBrowseExcel);
        this.grpImport.Controls.Add(this.btnImport);
        this.grpImport.Dock = System.Windows.Forms.DockStyle.Fill;
        this.grpImport.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(200)))), ((int)(((byte)(230)))), ((int)(((byte)(250)))));
        this.grpImport.Location = new System.Drawing.Point(3, 213);
        this.grpImport.Name = "grpImport";
        this.grpImport.Size = new System.Drawing.Size(998, 80);
        this.grpImport.TabIndex = 3;
        this.grpImport.TabStop = false;
        this.grpImport.Text = "Import données vers DB";
        // 
        // txtDatasetKey
        // 
        this.txtDatasetKey.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(16)))), ((int)(((byte)(29)))), ((int)(((byte)(46)))));
        this.txtDatasetKey.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
        this.txtDatasetKey.ForeColor = System.Drawing.Color.White;
        this.txtDatasetKey.Location = new System.Drawing.Point(10, 25);
        this.txtDatasetKey.Name = "txtDatasetKey";
        this.txtDatasetKey.Size = new System.Drawing.Size(185, 23);
        this.txtDatasetKey.TabIndex = 0;
        this.txtDatasetKey.Text = "saip-main";
        // 
        // txtExcelPath
        // 
        this.txtExcelPath.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(16)))), ((int)(((byte)(29)))), ((int)(((byte)(46)))));
        this.txtExcelPath.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
        this.txtExcelPath.ForeColor = System.Drawing.Color.White;
        this.txtExcelPath.Location = new System.Drawing.Point(201, 25);
        this.txtExcelPath.Name = "txtExcelPath";
        this.txtExcelPath.Size = new System.Drawing.Size(650, 23);
        this.txtExcelPath.TabIndex = 1;
        // 
        // btnBrowseExcel
        // 
        this.btnBrowseExcel.Location = new System.Drawing.Point(857, 24);
        this.btnBrowseExcel.Name = "btnBrowseExcel";
        this.btnBrowseExcel.Size = new System.Drawing.Size(132, 25);
        this.btnBrowseExcel.TabIndex = 2;
        this.btnBrowseExcel.Text = "Choisir fichier";
        this.btnBrowseExcel.UseVisualStyleBackColor = true;
        // 
        // btnImport
        // 
        this.btnImport.Location = new System.Drawing.Point(10, 54);
        this.btnImport.Name = "btnImport";
        this.btnImport.Size = new System.Drawing.Size(220, 23);
        this.btnImport.TabIndex = 3;
        this.btnImport.Text = "Lancer import";
        this.btnImport.UseVisualStyleBackColor = true;
        // 
        // grpSharepoint
        // 
        this.grpSharepoint.Controls.Add(this.txtSharepointUrl);
        this.grpSharepoint.Controls.Add(this.btnSaveSharepointUrl);
        this.grpSharepoint.Controls.Add(this.btnOpenSharepointUrl);
        this.grpSharepoint.Dock = System.Windows.Forms.DockStyle.Fill;
        this.grpSharepoint.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(200)))), ((int)(((byte)(230)))), ((int)(((byte)(250)))));
        this.grpSharepoint.Location = new System.Drawing.Point(3, 299);
        this.grpSharepoint.Name = "grpSharepoint";
        this.grpSharepoint.Size = new System.Drawing.Size(998, 74);
        this.grpSharepoint.TabIndex = 4;
        this.grpSharepoint.TabStop = false;
        this.grpSharepoint.Text = "URL SharePoint (téléchargement source)";
        // 
        // txtSharepointUrl
        // 
        this.txtSharepointUrl.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(16)))), ((int)(((byte)(29)))), ((int)(((byte)(46)))));
        this.txtSharepointUrl.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
        this.txtSharepointUrl.ForeColor = System.Drawing.Color.White;
        this.txtSharepointUrl.Location = new System.Drawing.Point(10, 24);
        this.txtSharepointUrl.Name = "txtSharepointUrl";
        this.txtSharepointUrl.Size = new System.Drawing.Size(979, 23);
        this.txtSharepointUrl.TabIndex = 0;
        // 
        // btnSaveSharepointUrl
        // 
        this.btnSaveSharepointUrl.Location = new System.Drawing.Point(10, 50);
        this.btnSaveSharepointUrl.Name = "btnSaveSharepointUrl";
        this.btnSaveSharepointUrl.Size = new System.Drawing.Size(185, 23);
        this.btnSaveSharepointUrl.TabIndex = 1;
        this.btnSaveSharepointUrl.Text = "Enregistrer URL";
        this.btnSaveSharepointUrl.UseVisualStyleBackColor = true;
        // 
        // btnOpenSharepointUrl
        // 
        this.btnOpenSharepointUrl.Location = new System.Drawing.Point(201, 50);
        this.btnOpenSharepointUrl.Name = "btnOpenSharepointUrl";
        this.btnOpenSharepointUrl.Size = new System.Drawing.Size(200, 23);
        this.btnOpenSharepointUrl.TabIndex = 2;
        this.btnOpenSharepointUrl.Text = "Ouvrir dans le navigateur";
        this.btnOpenSharepointUrl.UseVisualStyleBackColor = true;
        // 
        // grpReminder
        // 
        this.grpReminder.Controls.Add(this.dtpReminderTime);
        this.grpReminder.Controls.Add(this.btnSetReminder);
        this.grpReminder.Controls.Add(this.btnShowReminder);
        this.grpReminder.Controls.Add(this.btnClearReminder);
        this.grpReminder.Dock = System.Windows.Forms.DockStyle.Fill;
        this.grpReminder.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(200)))), ((int)(((byte)(230)))), ((int)(((byte)(250)))));
        this.grpReminder.Location = new System.Drawing.Point(3, 379);
        this.grpReminder.Name = "grpReminder";
        this.grpReminder.Size = new System.Drawing.Size(998, 68);
        this.grpReminder.TabIndex = 5;
        this.grpReminder.TabStop = false;
        this.grpReminder.Text = "Rappel automatique (tâche planifiée Windows)";
        // 
        // dtpReminderTime
        // 
        this.dtpReminderTime.Format = System.Windows.Forms.DateTimePickerFormat.Time;
        this.dtpReminderTime.Location = new System.Drawing.Point(10, 28);
        this.dtpReminderTime.Name = "dtpReminderTime";
        this.dtpReminderTime.ShowUpDown = true;
        this.dtpReminderTime.Size = new System.Drawing.Size(109, 23);
        this.dtpReminderTime.TabIndex = 0;
        // 
        // btnSetReminder
        // 
        this.btnSetReminder.Location = new System.Drawing.Point(125, 28);
        this.btnSetReminder.Name = "btnSetReminder";
        this.btnSetReminder.Size = new System.Drawing.Size(224, 23);
        this.btnSetReminder.TabIndex = 1;
        this.btnSetReminder.Text = "Programmer rappel quotidien";
        this.btnSetReminder.UseVisualStyleBackColor = true;
        // 
        // btnShowReminder
        // 
        this.btnShowReminder.Location = new System.Drawing.Point(355, 28);
        this.btnShowReminder.Name = "btnShowReminder";
        this.btnShowReminder.Size = new System.Drawing.Size(165, 23);
        this.btnShowReminder.TabIndex = 2;
        this.btnShowReminder.Text = "Voir état du rappel";
        this.btnShowReminder.UseVisualStyleBackColor = true;
        // 
        // btnClearReminder
        // 
        this.btnClearReminder.Location = new System.Drawing.Point(526, 28);
        this.btnClearReminder.Name = "btnClearReminder";
        this.btnClearReminder.Size = new System.Drawing.Size(165, 23);
        this.btnClearReminder.TabIndex = 3;
        this.btnClearReminder.Text = "Supprimer rappel";
        this.btnClearReminder.UseVisualStyleBackColor = true;
        // 
        // txtLog
        // 
        this.txtLog.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(8)))), ((int)(((byte)(16)))), ((int)(((byte)(28)))));
        this.txtLog.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
        this.txtLog.Dock = System.Windows.Forms.DockStyle.Fill;
        this.txtLog.Font = new System.Drawing.Font("Consolas", 9F);
        this.txtLog.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(204)))), ((int)(((byte)(244)))), ((int)(((byte)(255)))));
        this.txtLog.Location = new System.Drawing.Point(3, 453);
        this.txtLog.Multiline = true;
        this.txtLog.Name = "txtLog";
        this.txtLog.ReadOnly = true;
        this.txtLog.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
        this.txtLog.Size = new System.Drawing.Size(998, 215);
        this.txtLog.TabIndex = 6;
        // 
        // btnClearLog
        // 
        this.btnClearLog.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Top)));
        this.btnClearLog.Location = new System.Drawing.Point(3, 674);
        this.btnClearLog.Name = "btnClearLog";
        this.btnClearLog.Size = new System.Drawing.Size(155, 24);
        this.btnClearLog.TabIndex = 7;
        this.btnClearLog.Text = "Vider le journal";
        this.btnClearLog.UseVisualStyleBackColor = true;
        // 
        // Form1
        // 
        this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
        this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
        this.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(7)))), ((int)(((byte)(15)))), ((int)(((byte)(26)))));
        this.ClientSize = new System.Drawing.Size(1024, 731);
        this.Controls.Add(this.rootLayout);
        this.Font = new System.Drawing.Font("Segoe UI", 9F);
        this.MinimumSize = new System.Drawing.Size(1040, 770);
        this.Name = "Form1";
        this.Padding = new System.Windows.Forms.Padding(10);
        this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
        this.Text = "DB Tools Portable";
        this.rootLayout.ResumeLayout(false);
        this.rootLayout.PerformLayout();
        this.grpWorkspace.ResumeLayout(false);
        this.grpWorkspace.PerformLayout();
        this.grpDatabase.ResumeLayout(false);
        this.grpDatabase.PerformLayout();
        this.grpImport.ResumeLayout(false);
        this.grpImport.PerformLayout();
        this.grpSharepoint.ResumeLayout(false);
        this.grpSharepoint.PerformLayout();
        this.grpReminder.ResumeLayout(false);
        this.ResumeLayout(false);
    }

    #endregion
}
