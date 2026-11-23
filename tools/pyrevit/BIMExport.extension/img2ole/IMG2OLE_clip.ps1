<#
.SYNOPSIS
  Puts a picture file on the Windows clipboard so AutoCAD can paste it as an
  embedded OLE picture. Called by IMG2OLE.lsp - you do not run this yourself.

.PARAMETER Path
  Picture file (PNG, JPG, BMP, GIF, TIF).

.PARAMETER Format
  EMF (default) = "Picture (Enhanced Metafile)", the same type DiRoots creates.
  DIB           = plain bitmap ("Device Independent Bitmap").

  Transparent areas are filled with white first, so logos never paste with a
  black background.

  Exit code 0 = picture is on the clipboard. 1 = failed (message on stderr).
#>
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [ValidateSet('EMF', 'DIB')][string]$Format = 'EMF'
)

$ErrorActionPreference = 'Stop'

try {
    Add-Type -AssemblyName System.Drawing
    Add-Type -AssemblyName System.Windows.Forms

    if (-not ('I2OClip' -as [type])) {
        Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;

public static class I2OClip
{
    [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool EmptyClipboard();
    [DllImport("user32.dll")] static extern IntPtr SetClipboardData(uint format, IntPtr hMem);
    [DllImport("user32.dll")] static extern bool CloseClipboard();
    [DllImport("gdi32.dll")]  static extern IntPtr CopyEnhMetaFile(IntPtr hemf, IntPtr fileName);
    [DllImport("gdi32.dll")]  static extern bool DeleteEnhMetaFile(IntPtr hemf);

    const uint CF_ENHMETAFILE = 14;

    // Picture on a white background, 24-bit, same pixel size as the file.
    public static Bitmap Flatten(string path)
    {
        using (Image img = Image.FromFile(path))
        {
            Bitmap bmp = new Bitmap(img.Width, img.Height, PixelFormat.Format24bppRgb);
            bmp.SetResolution(96f, 96f);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.White);
                g.DrawImage(img, 0, 0, img.Width, img.Height);
            }
            return bmp;
        }
    }

    // Wrap the picture in an Enhanced Metafile and put it on the clipboard.
    public static void PutEmf(string path)
    {
        using (Bitmap bmp = Flatten(path))
        using (Graphics refG = Graphics.FromHwnd(IntPtr.Zero))
        {
            Metafile mf;
            IntPtr hdc = refG.GetHdc();
            try
            {
                mf = new Metafile(hdc, new Rectangle(0, 0, bmp.Width, bmp.Height),
                                  MetafileFrameUnit.Pixel, EmfType.EmfOnly);
            }
            finally { refG.ReleaseHdc(hdc); }

            using (Graphics g = Graphics.FromImage(mf))
            {
                g.DrawImage(bmp, 0, 0, bmp.Width, bmp.Height);
            }

            IntPtr h = mf.GetHenhmetafile();
            IntPtr copy = CopyEnhMetaFile(h, IntPtr.Zero);
            DeleteEnhMetaFile(h);
            mf.Dispose();
            if (copy == IntPtr.Zero) throw new Exception("Could not copy the metafile.");

            Open();
            try
            {
                EmptyClipboard();
                if (SetClipboardData(CF_ENHMETAFILE, copy) == IntPtr.Zero)
                {
                    DeleteEnhMetaFile(copy);
                    throw new Exception("SetClipboardData failed.");
                }
            }
            finally { CloseClipboard(); }
        }
    }

    static void Open()
    {
        for (int i = 0; i < 30; i++)
        {
            if (OpenClipboard(IntPtr.Zero)) return;
            Thread.Sleep(100);
        }
        throw new Exception("The clipboard is busy (another program is using it).");
    }
}
'@
    }

    if (-not (Test-Path -LiteralPath $Path)) { throw "Picture file not found: $Path" }

    if ($Format -eq 'DIB') {
        $bmp = [I2OClip]::Flatten($Path)
        [System.Windows.Forms.Clipboard]::SetImage($bmp)
        $bmp.Dispose()
    }
    else {
        [I2OClip]::PutEmf($Path)
    }
    exit 0
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
