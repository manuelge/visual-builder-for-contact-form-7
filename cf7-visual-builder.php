<?php
/*
  Plugin Name: Visual Builder for Contact Form 7
  Plugin URI: https://etruel.com/downloads/visual-builder-contact-form-7/
  Description: Build Contact Form 7 forms visually: drag & drop fields, live preview, one-click field editing and a code editor, side by side. Requires Contact Form 7.
  Author: Etruel Developments LLC
  Author URI: https://etruel.com
  License: GPLv2
  Text Domain: visual-builder-for-contact-form-7
  Domain Path: /languages/
  Version: 3.0
  Requires at least: 6.4
  Requires PHP: 7.4
  Requires Plugins: contact-form-7
 */

/*
  Copyright (C) 2015 esteban

  This program is free software; you can redistribute it and/or
  modify it under the terms of the GNU General Public License
  as published by the Free Software Foundation; either version 2
  of the License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program; if not, write to the Free Software
  Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WPECF7VB_VERSION', '3.0' );
define( 'WPECF7VB_PLUGIN', __FILE__ );
define( 'WPECF7VB_DIR', plugin_dir_path( __FILE__ ) );

/**
 * Oldest Contact Form 7 version supported: 6.0 introduced the <dialog> based tag generator.
 */
define( 'WPECF7VB_MIN_CF7', '6.0' );

function wpecf7vb_load() {
	load_plugin_textdomain( 'visual-builder-for-contact-form-7', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );

	if ( ! class_exists( 'WPCF7' ) || ! defined( 'WPCF7_VERSION' ) ) {
		require_once WPECF7VB_DIR . 'class.wpcf7vb-extension-activation.php';
		$activation = new wpcf7_Extension_Activation( WPECF7VB_DIR, basename( __FILE__ ) );
		$activation->run();
		return;
	}

	if ( version_compare( WPCF7_VERSION, WPECF7VB_MIN_CF7, '<' ) ) {
		add_action( 'admin_notices', 'wpecf7vb_old_cf7_notice' );
		return;
	}

	require_once WPECF7VB_DIR . 'includes/class-wpecf7vb-admin.php';
	WPECF7VB_Admin::instance();
}

add_action( 'plugins_loaded', 'wpecf7vb_load', 999 );

/**
 * Shown when Contact Form 7 is active but too old for this version of the builder.
 */
function wpecf7vb_old_cf7_notice() {
	if ( ! current_user_can( 'activate_plugins' ) ) {
		return;
	}
	printf(
		'<div class="notice notice-warning"><p>%s</p></div>',
		esc_html(
			sprintf(
				/* translators: 1: required Contact Form 7 version, 2: installed version */
				__( 'Visual Builder for Contact Form 7 needs Contact Form 7 %1$s or newer (installed: %2$s). Please update Contact Form 7 to use the Visual Builder.', 'visual-builder-for-contact-form-7' ),
				WPECF7VB_MIN_CF7,
				WPCF7_VERSION
			)
		)
	);
}

function wpecf7vb_plugin_url( $path = '' ) {
	return plugins_url( $path, WPECF7VB_PLUGIN );
}
