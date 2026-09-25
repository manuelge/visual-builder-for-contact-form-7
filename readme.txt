=== Visual Builder for Contact Form 7 ===
Contributors: etruel
Donate link: https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=GT3UVS8UCAHV8
Tags: contact form 7, form builder, drag and drop, visual editor, cf7
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Requires Plugins: contact-form-7
Stable tag: trunk
License: GPLv2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html

Build Contact Form 7 forms visually: drag & drop fields, see a live preview and edit any field in one click, next to the code.

== Description ==

**Stop editing your forms blind.** Contact Form 7 is the most popular form plugin for WordPress, but its forms are written as code in a plain text box. Visual Builder for Contact Form 7 turns that box into a modern visual builder: you see your form as your visitors will, and you change it with a click or a drag.

Your forms keep being 100% Contact Form 7. Visual Builder only helps you write them faster and with fewer mistakes, so everything you already know about Contact Form 7 still works: mail settings, messages, add-ons and shortcodes.

= See your form while you build it =

* **Live preview of every field**, rendered by Contact Form 7 itself and refreshed as you type.
* **Split, Code or Visual layout**: work side by side with the code, focus on the code, or hide it and build only visually.
* **Click a field to find it in the code**, and place the cursor in the code to see which field it belongs to.

= Build faster, with the mouse, the keyboard or your finger =

* **Drag & drop** fields to reorder your form, on desktop, tablet and phone.
* **Move, duplicate or delete** any field with one click, and bring it back with **Undo**.
* **Add new fields exactly where you want them**: select a field and the Contact Form 7 buttons insert the new one right after it.
* **Keyboard shortcuts** for power users: arrows to move between fields, Alt + arrows to reorder, Delete and Enter to edit.

= Edit any field without touching the code =

* **One-click field editor** with a live preview: label, name, required, options and choices.
* **Labels made easy**: type a label and Visual Builder writes the right markup for you, the same way Contact Form 7 does.
* **Built-in validation** of field names, so you avoid broken forms before you save.
* Prefer code? Edit the source of any block, or the whole form, whenever you want.

= A better code editor, too =

* **Syntax highlighting** with the code editor built into WordPress.
* **Color schemes** for the code: Default, Monokai, Blackboard and Cobalt.
* Your layout and color scheme are **remembered for each user**.

= Safe for your forms =

* **Your hand-written code is respected**: custom HTML, comments, styles and scripts stay exactly as you wrote them. Visual Builder only changes the fields you work on.
* **Every change can be undone**, from the Undo button or with Ctrl+Z in the code editor.
* **Nothing changes on your site** until you click Save, and your forms on the front end are served by Contact Form 7 as always.
* **No lock-in**: if you ever deactivate Visual Builder, your forms keep working exactly the same.

= Made for everybody =

* **Beginners** create and organize forms without learning the Contact Form 7 syntax.
* **Designers and agencies** build client forms in minutes and see the result right away.
* **Developers** keep full control of the code, with a faster way to reorder and review long forms.

Visual Builder follows the look of the WordPress admin, works with screen readers and the keyboard, adapts to small screens and is translation ready (Spanish included).

== Installation ==

You can either install it automatically from the WordPress admin, or do it manually:

= Using the Plugin Manager =

1. Click Plugins
2. Click Add New
3. Search for `Contact Form 7 Visual Builder`
4. Click Install
5. Click Install Now
6. Click Activate Plugin
7. Edit a contact form: the Visual Form tab shows the builder next to the code editor.

= Manually =

1. Upload the `visual-builder-for-contact-form-7` folder to the `/wp-content/plugins/` directory
2. Activate the plugin through the 'Plugins' menu in WordPress

== Frequently Asked Questions ==

= Do I need Contact Form 7? =

Yes. Visual Builder is an add-on for Contact Form 7 6.0 or newer. WordPress lists Contact Form 7 as a required plugin and lets you install it in one click.

= Will my existing forms keep working? =

Yes. Visual Builder opens your current forms as they are, and it only changes the fields you edit. Your forms on the site are still served by Contact Form 7.

= Does it change how my forms look on my site? =

No. The look of your forms on the site comes from your theme and Contact Form 7. The preview in the builder shows the fields with the WordPress admin styles, so you can focus on the content and the order.

= Can I still write code? =

Of course. The code editor is always one click away, in the Split or Code layout, and every change you make there shows up in the visual builder.

= Does it work on tablets and phones? =

Yes. The builder adapts to small screens and you can drag fields with your finger.

= What happens if I deactivate it? =

Your forms keep working exactly the same, because Visual Builder saves them in the standard Contact Form 7 format.

= Why does a block say "This block has no visible output"? =

That block only contains content that visitors do not see, such as hidden fields or HTML comments.

== Screenshots ==

1. Build your form visually, side by side with the code: every field is a card with a live preview.
2. Edit any field in one click: label, name, required, options and choices, with a live preview.
3. Visual layout: hide the code and focus on your form.

== Changelog ==

= 3.0 Sep 24, 2026 =
The biggest update ever: a brand-new visual builder, built for Contact Form 7 6.x.

* New: modern interface with Split, Code and Visual layouts.
* New: every field is a card with a live preview rendered by Contact Form 7.
* New: drag & drop on desktop, tablets and phones.
* New: one-click field editor with live preview: label, name, required, options and choices.
* New: type a label and Visual Builder writes the label markup for you.
* New: duplicate fields, move them up and down, and delete them with Undo.
* New: add new fields right after the selected one.
* New: click a field to find it in the code, and see which field the code cursor is in.
* New: keyboard shortcuts to move between fields, reorder, delete and edit.
* New: each field on its own line gets its own card, for a clearer view of long forms.
* Improved: code editor based on the one built into WordPress, for a lighter plugin, with the Monokai, Blackboard and Cobalt color schemes.
* Improved: your layout and color scheme are remembered for each user.
* Improved: your custom HTML, comments, styles and scripts are always kept as you wrote them.
* Improved: stronger security, with permission checks and sanitized data in every request.
* Improved: accessibility for keyboard and screen reader users.
* Improved: new screenshots, and updated translation catalog and Spanish translation.
* Compatible with WordPress 7.1 and Contact Form 7 6.1.7. Requires WordPress 6.4, PHP 7.4 and Contact Form 7 6.0 or newer.

= 2.5 Sep 16, 2021 =
* Tested with WP 5.8.1 and CF7 5.4.2
* New icons and logo :D
* Tweaks some styes.
* Added .pot catalog and Spanish language files.
* Fixes issue does not show form or visual builder on New Form.
* Updated Author name and URIs.

= 2.4 May 2, 2021 =
* Compatibility with Contact Form 7 v5.4.1 and WordPress v5.7.1
* Adds requirements on activating to avoid errors if CF7 is not present.
* Tweak uses the WordPress wheel gif for reload when refreshing the form.
* Fixes the functionality of the form viewer hiding the reload form.
* Fixes bug when refreshing the form and deleting an item.
* Fixes failure to execute script elements in visual form.
* Fixes javascript errors on contact forms list.
* Fixes javascript errors for cm.theme.options on editing form screen.

= 2.3 =
* Compatibility with Contact Form 7 v4.8 and Wordpress v4.8.
* Few tweaks on design and cosmetic.

= 2.2 =
* Fixes a Fatal error: Can’t use function return value in write context in some versions of PHP.

= 2.1 =
* Improvement the text editor to works with javascript. You can now change order like any field.
* Improvement the text editor retain the css in the top of the form.
* Tweak, Option to refresh the visual form.
* Tweak, by adding nonces to the AJAX requests.

= 2.0 =
Closest...
* Tested with WP 4.7 and CF7 4.6
* Tweak, the color scheme is now htmlmixed for html, js and css coding.
* Tweak, eye icon is now a wordpress dashicon saving loading time of data images in css.
* Improvement, Visual form view (eye icon) state is now saved on click via ajax.
* Improvement, TextArea code Highlighter have now selectable themes to choose different colors schemes.
* Improvement The color schema is saved via ajax on select.
* Fixes the shortcodes without html tags as in default forms adding p tags.
* New collaborator & new Banners :D

= 1.1 =
Second approach:
Added HTML code highlighter in the textarea.
Added support for "p" and "label" html tags.  (Until now was just p)

= 1.0 =
First approach to Visual Builder for forms from Contact Form 7.

== Upgrade Notice ==

= 3.0 =
Brand-new visual builder for Contact Form 7 6.x: live preview, drag & drop on any device, one-click field editing and a faster code editor. Requires WordPress 6.4, PHP 7.4 and Contact Form 7 6.0.
