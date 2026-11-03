<#
mc_probe.ps1 —— 截 Minecraft 窗口 + 发按键（只做验证任务书需要的最小集合）

用法（在 PowerShell 里）：
    .\mc_probe.ps1 -Action info
    .\mc_probe.ps1 -Action shot -Out D:\shot.png
    .\mc_probe.ps1 -Action resize -X 1280 -Y 760
    .\mc_probe.ps1 -Action keymsg -Key j
    .\mc_probe.ps1 -Action clickmsg -X 541 -Y 224   # 多数情况下游戏不响应，仅备用

要点：
  * 窗口类名是 GLFW30（不是 "Minecraft"）
  * 截图前必须 SetProcessDpiAwareness(2)，否则缩放 >100% 时整块区域偏移
  * SendInput / keybd_event / mouse_event 对 MC 全部无效，只有 PostMessage(WM_KEYDOWN) 能进游戏
  * 鼠标点击基本无效，需要点击的地方请改键位
#>
param(
    [string]$Action = 'info',
    [string]$Out = 'shot.png',
    [string]$Key = 'e',
    [int]$X = 1280,
    [int]$Y = 720
)

Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public class MCP {
    public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int t, bool repaint);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint type);
    [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int v);

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

    public static IntPtr Find() {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr h, IntPtr l) {
            if (!IsWindowVisible(h)) return true;
            StringBuilder sb = new StringBuilder(256);
            GetClassName(h, sb, 256);
            string c = sb.ToString();
            if (c == "GLFW30" || c.StartsWith("LWJGL")) { found = h; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static int[] Client(IntPtr h) {
        RECT r; GetClientRect(h, out r);
        POINT p = new POINT(); p.X = 0; p.Y = 0;
        ClientToScreen(h, ref p);
        return new int[] { p.X, p.Y, r.R - r.L, r.B - r.T };
    }
}
'@

$vk = @{
    'w'=0x57;'a'=0x41;'s'=0x53;'d'=0x44;'e'=0x45;'q'=0x51;'r'=0x52;'f'=0x46
    't'=0x54;'j'=0x4A;'k'=0x4B;'m'=0x4D;'i'=0x49;'c'=0x43;'x'=0x58;'z'=0x5A
    'g'=0x47;'h'=0x48;'b'=0x42;'l'=0x4C;'n'=0x4E;'o'=0x4F;'p'=0x50;'u'=0x55
    'v'=0x56;'y'=0x59
    'space'=0x20;'escape'=0x1B;'enter'=0x0D;'tab'=0x09;'shift'=0x10;'ctrl'=0x11
    '1'=0x31;'2'=0x32;'3'=0x33;'4'=0x34;'5'=0x35;'6'=0x36;'7'=0x37;'8'=0x38;'9'=0x39;'0'=0x30
    'f3'=0x72;'f5'=0x74;'left'=0x25;'up'=0x26;'right'=0x27;'down'=0x28
}

try { [void][MCP]::SetProcessDpiAwareness(2) } catch { }

$h = [MCP]::Find()
if ($h -eq [IntPtr]::Zero) { Write-Output 'NOWINDOW'; exit 2 }

switch ($Action) {
    'info' {
        $r = [MCP]::Client($h)
        Write-Output ("HWND={0} FG={1} X={2} Y={3} W={4} H={5}" -f $h, [MCP]::GetForegroundWindow(), $r[0], $r[1], $r[2], $r[3])
    }
    'shot' {
        [void][MCP]::ShowWindow($h, 9); [void][MCP]::SetForegroundWindow($h)
        Start-Sleep -Milliseconds 300
        $r = [MCP]::Client($h)
        $bmp = New-Object System.Drawing.Bitmap($r[2], $r[3])
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($r[0], $r[1], 0, 0, $bmp.Size)
        $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose(); $bmp.Dispose()
        Write-Output ("OK {0} {1}x{2}" -f $Out, $r[2], $r[3])
    }
    'resize' {
        [void][MCP]::MoveWindow($h, 40, 40, $X, $Y, $true)
        Start-Sleep -Milliseconds 800
        $r = [MCP]::Client($h)
        Write-Output ("RESIZED {0}x{1} at {2},{3}" -f $r[2], $r[3], $r[0], $r[1])
    }
    'keymsg' {
        $code = $vk[$Key.ToLower()]
        if ($null -eq $code) { Write-Output "BADKEY $Key"; exit 3 }
        $sc = [MCP]::MapVirtualKey($code, 0)
        $down = [IntPtr](1 -bor ($sc -shl 16))
        $up   = [IntPtr](1 -bor ($sc -shl 16) -bor (1 -shl 30) -bor (1 -shl 31))
        [void][MCP]::PostMessage($h, 0x0100, [IntPtr]$code, $down)
        Start-Sleep -Milliseconds 90
        [void][MCP]::PostMessage($h, 0x0101, [IntPtr]$code, $up)
        Write-Output ("KEYMSG {0} sc={1}" -f $Key, $sc)
    }
    'clickmsg' {
        $lp = ($Y -shl 16) -bor $X
        [void][MCP]::PostMessage($h, 0x0200, [IntPtr]::Zero, [IntPtr]$lp)
        [void][MCP]::PostMessage($h, 0x0201, [IntPtr]1, [IntPtr]$lp)
        Start-Sleep -Milliseconds 90
        [void][MCP]::PostMessage($h, 0x0202, [IntPtr]::Zero, [IntPtr]$lp)
        Write-Output ("CLICKMSG {0},{1}（多数情况下游戏不响应）" -f $X, $Y)
    }
    default { Write-Output "BADACTION $Action"; exit 4 }
}
