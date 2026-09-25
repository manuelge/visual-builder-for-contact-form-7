<?php
/**
 * Admin integration: editor panel, assets, AJAX endpoints and user preferences.
 *
 * @package VisualBuilderCF7
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WPECF7VB_Admin {

	const NONCE      = 'wpecf7vb';
	const PREFS_META = 'wpecf7vb_prefs';

	/**
	 * Max number of blocks rendered in a single preview request.
	 */
	const MAX_BLOCKS = 300;

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_filter( 'wpcf7_editor_panels', array( $this, 'editor_panels' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ), 20 );
		add_action( 'wp_ajax_wpecf7vb_render', array( $this, 'ajax_render' ) );
		add_action( 'wp_ajax_wpecf7vb_prefs', array( $this, 'ajax_prefs' ) );
	}

	/**
	 * Code editor color schemes: value => label.
	 */
	public static function themes() {
		return array(
			''           => __( 'Default', 'visual-builder-for-contact-form-7' ),
			'monokai'    => 'Monokai',
			'blackboard' => 'Blackboard',
			'cobalt'     => 'Cobalt',
		);
	}

	/**
	 * Plugin version plus the file time, so browsers never keep an outdated copy of an asset.
	 */
	private static function asset_version( $path ) {
		$time = @filemtime( WPECF7VB_DIR . $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		return $time ? WPECF7VB_VERSION . '.' . $time : WPECF7VB_VERSION;
	}

	public static function views() {
		return array( 'split', 'code', 'visual' );
	}

	/**
	 * Preferences of the current user, migrated from the pre 3.0 global options when missing.
	 */
	public static function get_prefs() {
		$prefs = get_user_meta( get_current_user_id(), self::PREFS_META, true );

		if ( ! is_array( $prefs ) ) {
			$prefs = array(
				'view'  => false !== strpos( (string) get_option( 'icon_eyes_status', '' ), 'hidden' ) ? 'code' : 'split',
				'theme' => (string) get_option( 'wpecf7vb_selection_theme', '' ),
			);
		}

		$prefs = wp_parse_args( $prefs, array( 'view' => 'split', 'theme' => '' ) );

		if ( ! in_array( $prefs['view'], self::views(), true ) ) {
			$prefs['view'] = 'split';
		}
		if ( ! array_key_exists( $prefs['theme'], self::themes() ) ) {
			$prefs['theme'] = '';
		}

		return $prefs;
	}

	/**
	 * True on the "edit contact form" and "add new contact form" screens.
	 */
	private function is_editor_screen() {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- read only screen detection.
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';

		if ( 'wpcf7-new' === $page ) {
			return true;
		}

		return 'wpcf7' === $page && ! empty( $_GET['post'] );
		// phpcs:enable
	}

	private function can_edit( $post_id ) {
		if ( $post_id > 0 ) {
			return current_user_can( 'wpcf7_edit_contact_form', $post_id );
		}
		return current_user_can( 'wpcf7_edit_contact_forms' );
	}

	/**
	 * Replaces the Contact Form 7 "Form" panel with the builder.
	 */
	public function editor_panels( $panels ) {
		if ( isset( $panels['form-panel'] ) ) {
			$panels['form-panel'] = array(
				'title'    => __( 'Visual Form', 'visual-builder-for-contact-form-7' ),
				'callback' => array( $this, 'form_panel' ),
			);
		}
		return $panels;
	}

	public function enqueue( $hook_suffix ) {
		if ( false === strpos( $hook_suffix, 'wpcf7' ) || ! $this->is_editor_screen() ) {
			return;
		}

		$prefs = self::get_prefs();

		// Honors the "Disable syntax highlighting" profile option: returns false in that case.
		$code_editor = wp_enqueue_code_editor(
			array(
				'type'       => 'text/html',
				'codemirror' => array(
					'lineWrapping'   => true,
					'indentUnit'     => 4,
					'tabSize'        => 4,
					'indentWithTabs' => true,
					'lint'           => false,
					'gutters'        => array(),
					'theme'          => '' === $prefs['theme'] ? 'default' : $prefs['theme'],
				),
			)
		);

		$style_deps = array( 'dashicons' );

		if ( false !== $code_editor ) {
			$style_deps[] = 'wp-codemirror';

			foreach ( array_keys( self::themes() ) as $theme ) {
				if ( '' === $theme ) {
					continue;
				}
				wp_enqueue_style(
					'wpecf7vb-theme-' . $theme,
					wpecf7vb_plugin_url( 'assets/css/themes/' . $theme . '.css' ),
					array( 'wp-codemirror' ),
					WPECF7VB_VERSION
				);
			}
		}

		wp_enqueue_style(
			'wpecf7vb-admin',
			wpecf7vb_plugin_url( 'assets/css/visual-builder.css' ),
			$style_deps,
			self::asset_version( 'assets/css/visual-builder.css' )
		);

		// Touch Punch maps touch events to the mouse events jQuery UI Sortable listens to.
		$script_deps = array( 'wpcf7-admin', 'jquery', 'jquery-ui-sortable', 'jquery-touch-punch', 'wp-a11y' );
		if ( false !== $code_editor ) {
			$script_deps[] = 'code-editor';
		}

		wp_enqueue_script(
			'wpecf7vb-admin',
			wpecf7vb_plugin_url( 'assets/js/visual-builder.js' ),
			$script_deps,
			self::asset_version( 'assets/js/visual-builder.js' ),
			array( 'in_footer' => true )
		);

		$contact_form = wpcf7_get_current_contact_form();
		$manager      = WPCF7_FormTagsManager::get_instance();

		wp_localize_script(
			'wpecf7vb-admin',
			'wpecf7vbSettings',
			array(
				'ajaxUrl'    => admin_url( 'admin-ajax.php' ),
				'nonce'      => wp_create_nonce( self::NONCE ),
				'postId'     => ( $contact_form && ! $contact_form->initial() ) ? $contact_form->id() : 0,
				'prefs'      => $prefs,
				'codeEditor' => $code_editor,
				'tagTypes'   => array_values( $manager->collect_tag_types() ),
				'namedTypes' => array_values( $manager->collect_tag_types( 'name-attr' ) ),
				'i18n'       => array(
					'block'          => __( 'Block', 'visual-builder-for-contact-form-7' ),
					'html'           => __( 'HTML', 'visual-builder-for-contact-form-7' ),
					'text'           => __( 'Text', 'visual-builder-for-contact-form-7' ),
					'required'       => __( 'Required', 'visual-builder-for-contact-form-7' ),
					'moveUp'         => __( 'Move up', 'visual-builder-for-contact-form-7' ),
					'moveDown'       => __( 'Move down', 'visual-builder-for-contact-form-7' ),
					'drag'           => __( 'Drag to reorder', 'visual-builder-for-contact-form-7' ),
					'edit'           => __( 'Edit', 'visual-builder-for-contact-form-7' ),
					'duplicate'      => __( 'Duplicate', 'visual-builder-for-contact-form-7' ),
					'delete'         => __( 'Delete', 'visual-builder-for-contact-form-7' ),
					'undo'           => __( 'Undo', 'visual-builder-for-contact-form-7' ),
					'deleted'        => __( 'Block deleted.', 'visual-builder-for-contact-form-7' ),
					/* translators: %d: new position of the block */
					'moved'          => __( 'Block moved to position %d.', 'visual-builder-for-contact-form-7' ),
					'duplicated'     => __( 'Block duplicated.', 'visual-builder-for-contact-form-7' ),
					'inserted'       => __( 'Form-tag inserted.', 'visual-builder-for-contact-form-7' ),
					'insertCursor'   => __( 'New fields go at the code cursor', 'visual-builder-for-contact-form-7' ),
					/* translators: %d: block number */
					'insertAfter'    => __( 'New fields go after block %d · Click to use the code cursor', 'visual-builder-for-contact-form-7' ),
					'updated'        => __( 'Block updated.', 'visual-builder-for-contact-form-7' ),
					'rendering'      => __( 'Updating preview…', 'visual-builder-for-contact-form-7' ),
					'renderError'    => __( 'The preview could not be updated. Your form is not affected.', 'visual-builder-for-contact-form-7' ),
					'retry'          => __( 'Retry', 'visual-builder-for-contact-form-7' ),
					'oneBlock'       => __( '1 block', 'visual-builder-for-contact-form-7' ),
					/* translators: %d: number of blocks in the form, always more than one */
					'blocksCount'    => __( '%d blocks', 'visual-builder-for-contact-form-7' ),
					'emptyPreview'   => __( 'This block has no visible output.', 'visual-builder-for-contact-form-7' ),
					'styleBlock'     => __( 'Styles for the form. They are applied on your site, not in this preview.', 'visual-builder-for-contact-form-7' ),
					'scriptBlock'    => __( 'Script for the form. It runs on your site, not in this preview.', 'visual-builder-for-contact-form-7' ),
					'editBlock'      => __( 'Edit block', 'visual-builder-for-contact-form-7' ),
					'formTag'        => __( 'Form-tag', 'visual-builder-for-contact-form-7' ),
					'label'          => __( 'Label', 'visual-builder-for-contact-form-7' ),
					'labelHelp'      => __( 'Text shown with the field. Leave it empty for no label.', 'visual-builder-for-contact-form-7' ),
					'legendHelp'     => __( 'Title of the group of choices, shown as a fieldset legend. Leave it empty for none.', 'visual-builder-for-contact-form-7' ),
					'name'           => __( 'Name', 'visual-builder-for-contact-form-7' ),
					'options'        => __( 'Options', 'visual-builder-for-contact-form-7' ),
					'optionsHelp'    => __( 'Space separated, e.g. id:my-id class:my-class placeholder autocomplete:email', 'visual-builder-for-contact-form-7' ),
					'values'         => __( 'Values', 'visual-builder-for-contact-form-7' ),
					'valuesHelp'     => __( 'One per line. For drop-down menus, checkboxes and radio buttons each line is a choice.', 'visual-builder-for-contact-form-7' ),
					'content'        => __( 'Content', 'visual-builder-for-contact-form-7' ),
					'source'         => __( 'Block source', 'visual-builder-for-contact-form-7' ),
					'sourceHelp'     => __( 'Everything this block contains: labels, HTML and form-tags.', 'visual-builder-for-contact-form-7' ),
					'preview'        => __( 'Preview', 'visual-builder-for-contact-form-7' ),
					'apply'          => __( 'Apply changes', 'visual-builder-for-contact-form-7' ),
					'cancel'         => __( 'Cancel', 'visual-builder-for-contact-form-7' ),
					'close'          => __( 'Close', 'visual-builder-for-contact-form-7' ),
					'unparsableTag'  => __( 'This form-tag uses a syntax the field editor cannot read. Edit it in the block source below.', 'visual-builder-for-contact-form-7' ),
					'invalidName'    => __( 'Names may use letters, numbers, hyphens, underscores, colons and periods, and must start with a letter.', 'visual-builder-for-contact-form-7' ),
					'noTags'         => __( 'This block has no form-tags. Edit its HTML in the block source.', 'visual-builder-for-contact-form-7' ),
				),
			)
		);
	}

	/**
	 * Output of the "Visual Form" editor panel.
	 *
	 * @param WPCF7_ContactForm $post Contact form being edited.
	 */
	public function form_panel( $post ) {
		$prefs = self::get_prefs();
		$views = array(
			'split'  => array( 'dashicons-columns', __( 'Split', 'visual-builder-for-contact-form-7' ) ),
			'code'   => array( 'dashicons-editor-code', __( 'Code', 'visual-builder-for-contact-form-7' ) ),
			'visual' => array( 'dashicons-visibility', __( 'Visual', 'visual-builder-for-contact-form-7' ) ),
		);
		?>
		<div class="wpecf7vb is-loading" id="wpecf7vb" data-view="<?php echo esc_attr( $prefs['view'] ); ?>">
			<div class="wpecf7vb-header">
				<div class="wpecf7vb-header__title">
					<h2><?php esc_html_e( 'Form', 'contact-form-7' ); ?></h2>
					<p class="description">
						<?php
						printf(
							/* translators: %s: URL to the Contact Form 7 docs about the form template */
							wp_kses(
								__( 'Drag blocks to reorder them, click one to find it in the code, or use the buttons below to add fields. <a href="%s" target="_blank" rel="noopener">Editing form template</a>.', 'visual-builder-for-contact-form-7' ),
								array( 'a' => array( 'href' => array(), 'target' => array(), 'rel' => array() ) )
							),
							esc_url( __( 'https://contactform7.com/editing-form-template/', 'contact-form-7' ) )
						);
						?>
					</p>
				</div>
				<div class="wpecf7vb-header__controls">
					<div class="wpecf7vb-segmented" role="radiogroup" aria-label="<?php esc_attr_e( 'Editor layout', 'visual-builder-for-contact-form-7' ); ?>">
						<?php foreach ( $views as $view => $data ) : ?>
							<button type="button" role="radio" title="<?php echo esc_attr( $data[1] ); ?>" data-view="<?php echo esc_attr( $view ); ?>" aria-checked="<?php echo $view === $prefs['view'] ? 'true' : 'false'; ?>">
								<span class="dashicons <?php echo esc_attr( $data[0] ); ?>" aria-hidden="true"></span>
								<span class="wpecf7vb-segmented__label"><?php echo esc_html( $data[1] ); ?></span>
							</button>
						<?php endforeach; ?>
					</div>
				</div>
			</div>

			<div class="wpecf7vb-taggen">
				<?php WPCF7_TagGenerator::get_instance()->print_buttons(); ?>
			</div>

			<div class="wpecf7vb-workspace">
				<section class="wpecf7vb-pane wpecf7vb-pane--code" aria-label="<?php esc_attr_e( 'Form template code', 'visual-builder-for-contact-form-7' ); ?>">
					<div class="wpecf7vb-pane__head">
						<span class="wpecf7vb-pane__title"><span class="dashicons dashicons-editor-code" aria-hidden="true"></span><?php esc_html_e( 'Code', 'visual-builder-for-contact-form-7' ); ?></span>
						<?php if ( wp_script_is( 'code-editor', 'enqueued' ) ) : ?>
							<label class="wpecf7vb-theme">
								<span class="screen-reader-text"><?php esc_html_e( 'Code color scheme', 'visual-builder-for-contact-form-7' ); ?></span>
								<span class="dashicons dashicons-art" aria-hidden="true"></span>
								<select id="wpecf7vb-theme" form="wpecf7vb-no-form">
									<?php foreach ( self::themes() as $value => $label ) : ?>
										<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $value, $prefs['theme'] ); ?>><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</label>
						<?php endif; ?>
					</div>
					<textarea id="wpcf7-form" name="wpcf7-form" cols="100" rows="24" class="large-text code" data-config-field="form.body"><?php echo esc_textarea( $post->prop( 'form' ) ); ?></textarea>
				</section>

				<section class="wpecf7vb-pane wpecf7vb-pane--visual" aria-label="<?php esc_attr_e( 'Visual form', 'visual-builder-for-contact-form-7' ); ?>">
					<div class="wpecf7vb-pane__head">
						<span class="wpecf7vb-pane__title"><span class="dashicons dashicons-visibility" aria-hidden="true"></span><?php esc_html_e( 'Visual', 'visual-builder-for-contact-form-7' ); ?></span>
						<span class="wpecf7vb-status" aria-live="polite"></span>
					</div>
					<ol class="wpecf7vb-blocks" id="wpecf7vb-blocks"></ol>
					<div class="wpecf7vb-empty" hidden>
						<span class="dashicons dashicons-feedback" aria-hidden="true"></span>
						<p><strong><?php esc_html_e( 'Your form is empty.', 'visual-builder-for-contact-form-7' ); ?></strong></p>
						<p><?php esc_html_e( 'Add fields with the buttons above or write the template in the code editor.', 'visual-builder-for-contact-form-7' ); ?></p>
					</div>
				</section>
			</div>
		</div>
		<?php
	}

	/**
	 * Renders form template blocks with Contact Form 7, for the visual preview.
	 */
	public function ajax_render() {
		check_ajax_referer( self::NONCE, 'nonce' );

		$post_id = isset( $_POST['post_id'] ) ? (int) $_POST['post_id'] : 0;

		if ( ! $this->can_edit( $post_id ) ) {
			wp_send_json_error( array( 'message' => __( 'You are not allowed to edit this contact form.', 'visual-builder-for-contact-form-7' ) ), 403 );
		}

		// Raw template text: sanitized on output, as Contact Form 7 does.
		$blocks = isset( $_POST['blocks'] ) ? json_decode( wp_unslash( $_POST['blocks'] ), true ) : null; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized

		if ( ! is_array( $blocks ) || count( $blocks ) > self::MAX_BLOCKS ) {
			wp_send_json_error( array( 'message' => __( 'Invalid request.', 'visual-builder-for-contact-form-7' ) ), 400 );
		}

		$contact_form = $post_id > 0 ? wpcf7_contact_form( $post_id ) : null;

		if ( ! $contact_form ) {
			$contact_form = WPCF7_ContactForm::get_template();
		}

		$html = array();

		foreach ( array_values( $blocks ) as $block ) {
			if ( ! is_string( $block ) || '' === trim( $block ) ) {
				$html[] = '';
				continue;
			}

			$contact_form->set_properties( array( 'form' => $block ) );
			$html[] = wpcf7_kses( $contact_form->form_elements(), 'form' );
		}

		wp_send_json_success( array( 'html' => $html ) );
	}

	/**
	 * Saves the layout and color scheme chosen by the current user.
	 */
	public function ajax_prefs() {
		check_ajax_referer( self::NONCE, 'nonce' );

		if ( ! current_user_can( 'wpcf7_read_contact_forms' ) ) {
			wp_send_json_error( null, 403 );
		}

		$prefs = self::get_prefs();

		if ( isset( $_POST['view'] ) ) {
			$view = sanitize_key( wp_unslash( $_POST['view'] ) );
			if ( in_array( $view, self::views(), true ) ) {
				$prefs['view'] = $view;
			}
		}

		if ( isset( $_POST['theme'] ) ) {
			$theme = sanitize_key( wp_unslash( $_POST['theme'] ) );
			if ( array_key_exists( $theme, self::themes() ) ) {
				$prefs['theme'] = $theme;
			}
		}

		update_user_meta( get_current_user_id(), self::PREFS_META, $prefs );

		wp_send_json_success( $prefs );
	}
}
