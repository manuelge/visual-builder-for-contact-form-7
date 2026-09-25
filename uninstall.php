<?php
/**
 * Removes the plugin data: per user preferences and the options used before 3.0.
 *
 * @package VisualBuilderCF7
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_metadata( 'user', 0, 'wpecf7vb_prefs', '', true );
delete_option( 'icon_eyes_status' );
delete_option( 'wpecf7vb_selection_theme' );
