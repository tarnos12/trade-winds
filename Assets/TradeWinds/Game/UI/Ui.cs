using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace TradeWinds.Game
{
    /// <summary>Small UI Toolkit builders shared by the HUD panels (inline styles; placeholder look).</summary>
    public static class Ui
    {
        public static readonly Color ButtonBg = new Color(0.25f, 0.2f, 0.14f, 1f);
        public static readonly Color ButtonDisabled = new Color(0.17f, 0.14f, 0.11f, 1f);

        public static VisualElement Card()
        {
            var v = new VisualElement();
            v.style.backgroundColor = Palette.Panel;
            Border(v, Palette.PanelEdge, 1);
            Radius(v, 6);
            v.style.paddingTop = v.style.paddingBottom = 6;
            v.style.paddingLeft = v.style.paddingRight = 10;
            return v;
        }

        public static void Border(VisualElement v, Color c, float w)
        {
            v.style.borderTopColor = v.style.borderBottomColor = v.style.borderLeftColor = v.style.borderRightColor = c;
            v.style.borderTopWidth = v.style.borderBottomWidth = v.style.borderLeftWidth = v.style.borderRightWidth = w;
        }

        public static void Radius(VisualElement v, float r) =>
            v.style.borderTopLeftRadius = v.style.borderTopRightRadius = v.style.borderBottomLeftRadius = v.style.borderBottomRightRadius = r;

        public static Label Text(string s, int size = 14, bool bold = false, Color? color = null)
        {
            var l = new Label(s);
            l.style.color = color ?? Palette.Paper;
            l.style.fontSize = size;
            if (bold) l.style.unityFontStyleAndWeight = FontStyle.Bold;
            l.style.whiteSpace = WhiteSpace.Normal;
            l.style.marginTop = l.style.marginBottom = 1;
            return l;
        }

        public static Label Heading(string s) => Text(s, 16, true, Palette.Castle);

        public static Button Button(string text, Action onClick, bool enabled = true, string tooltip = null)
        {
            var b = new Button(() => { if (enabled) onClick?.Invoke(); }) { text = text };
            b.style.backgroundColor = enabled ? ButtonBg : ButtonDisabled;
            b.style.color = enabled ? Palette.Paper : Palette.Muted;
            b.style.fontSize = 13;
            Border(b, Palette.PanelEdge, 1);
            b.style.marginLeft = b.style.marginRight = 2;
            b.style.marginTop = b.style.marginBottom = 2;
            b.style.paddingLeft = b.style.paddingRight = 8;
            b.style.paddingTop = b.style.paddingBottom = 3;
            if (!string.IsNullOrEmpty(tooltip)) b.tooltip = tooltip;
            return b;
        }

        public static void Highlight(Button b, bool on) => b.style.backgroundColor = on ? Palette.Accent : ButtonBg;

        public static VisualElement Row(params VisualElement[] children)
        {
            var r = new VisualElement();
            r.style.flexDirection = FlexDirection.Row;
            r.style.alignItems = Align.Center;
            r.style.flexWrap = Wrap.Wrap;
            foreach (var c in children) r.Add(c);
            return r;
        }

        /// <summary>A thin progress bar.</summary>
        public static VisualElement Bar(double fraction, Color fill, float width = 200, float height = 8)
        {
            var back = new VisualElement();
            back.style.width = width;
            back.style.height = height;
            back.style.backgroundColor = new Color(0, 0, 0, 0.4f);
            Radius(back, 3);
            var front = new VisualElement();
            front.style.width = new Length((float)Math.Max(0, Math.Min(1, fraction)) * 100f, LengthUnit.Percent);
            front.style.height = height;
            front.style.backgroundColor = fill;
            Radius(front, 3);
            back.Add(front);
            back.style.marginTop = back.style.marginBottom = 2;
            return back;
        }

        public static VisualElement Spacer(float h = 6)
        {
            var v = new VisualElement();
            v.style.height = h;
            return v;
        }

        public static ScrollView Scroll(float maxHeight)
        {
            var s = new ScrollView(ScrollViewMode.Vertical);
            s.style.maxHeight = maxHeight;
            return s;
        }

        public static Color HappinessColor(double h) => h >= 70 ? Palette.Good : h >= 40 ? Palette.Warn : Palette.Bad;
    }
}
