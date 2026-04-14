namespace DbToolsPortable;

static class Program
{
    /// <summary>
    ///  The main entry point for the application.
    /// </summary>
    [STAThread]
    static void Main(string[] args)
    {
        // To customize application configuration such as set high DPI settings or default font,
        // see https://aka.ms/applicationconfiguration.
        ApplicationConfiguration.Initialize();
        if (Form1.HandleCliArgsAndExitIfNeeded(args))
        {
            return;
        }
        Application.Run(new Form1());
    }
}
