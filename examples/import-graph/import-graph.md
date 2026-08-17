# Source Import Graph

`@graph` reads YAML frontmatter (see `examples/connections/connections.stage`);
it has no notion of TypeScript `import` statements, so it cannot graph real
source code directly. This is the `@code`-under-policy answer to the same
question, walking this project's own real `src/` tree.

## Policy grant this example needs

`.livestage/policy.json` in this directory: `code.languages` includes
`javascript`, nothing else.

## Result

```mermaid
graph TD
  cli_cli["cli/cli"]
  cli_cli_register_security["cli/cli-register-security"]
  cli_commands_assert["cli/commands/assert"]
  cli_commands_build["cli/commands/build"]
  cli_commands_cache["cli/commands/cache"]
  cli_commands_doctor["cli/commands/doctor"]
  cli_commands_engine_trace["cli/commands/engine-trace"]
  cli_commands_eval["cli/commands/eval"]
  cli_commands_init["cli/commands/init"]
  cli_commands_list_imports["cli/commands/list-imports"]
  cli_commands_list_macros["cli/commands/list-macros"]
  cli_commands_parse["cli/commands/parse"]
  cli_commands_render["cli/commands/render"]
  cli_commands_renderer_preview["cli/commands/renderer-preview"]
  cli_commands_security["cli/commands/security"]
  cli_commands_strip["cli/commands/strip"]
  cli_commands_validate["cli/commands/validate"]
  cli_commands_watch["cli/commands/watch"]
  cli_env_loader["cli/env-loader"]
  cli_glob_expand["cli/glob-expand"]
  cli_index["cli/index"]
  cli_templates_claude_section["cli/templates/claude-section"]
  engine_args["engine/args"]
  engine_assert_liveness["engine/assert/liveness"]
  engine_assert_operators["engine/assert/operators"]
  engine_assert_results["engine/assert/results"]
  engine_cache["engine/cache"]
  engine_code_runners["engine/code-runners"]
  engine_conditions["engine/conditions"]
  engine_context["engine/context"]
  engine_determinism["engine/determinism"]
  engine_directive_cache["engine/directive-cache"]
  engine_engine["engine/engine"]
  engine_engine_include["engine/engine-include"]
  engine_engine_interpolate["engine/engine-interpolate"]
  engine_engine_template["engine/engine-template"]
  engine_error_log["engine/error-log"]
  engine_exec_ops["engine/exec-ops"]
  engine_expand_context["engine/expand-context"]
  engine_file_access["engine/file-access"]
  engine_frontmatter_utils["engine/frontmatter-utils"]
  engine_graph["engine/graph"]
  engine_index["engine/index"]
  engine_iter_ops["engine/iter-ops"]
  engine_macros["engine/macros"]
  engine_pipe["engine/pipe"]
  engine_read_ops["engine/read-ops"]
  engine_schema_loader["engine/schema/loader"]
  engine_schema_validate["engine/schema/validate"]
  engine_security_audit["engine/security/audit"]
  engine_security_claude_settings["engine/security/claude-settings"]
  engine_security_config["engine/security/config"]
  engine_security_filesystem["engine/security/filesystem"]
  engine_security_masking["engine/security/masking"]
  engine_security_modes["engine/security/modes"]
  engine_security_path_expand["engine/security/path-expand"]
  engine_security_rules["engine/security/rules"]
  engine_security_shell["engine/security/shell"]
  engine_security_trust["engine/security/trust"]
  engine_shell["engine/shell"]
  engine_sources["engine/sources"]
  engine_sources_file_utils["engine/sources-file-utils"]
  engine_stripper["engine/stripper"]
  engine_trace_config["engine/trace/config"]
  engine_trace_emit["engine/trace/emit"]
  engine_trace_span["engine/trace/span"]
  engine_write_ops["engine/write-ops"]
  hook_pretooluse["hook/pretooluse"]
  parser_args["parser/args"]
  parser_directives_assert["parser/directives/assert"]
  parser_directives_cache_attrs["parser/directives/cache-attrs"]
  parser_directives_call["parser/directives/call"]
  parser_directives_check["parser/directives/check"]
  parser_directives_code["parser/directives/code"]
  parser_directives_count["parser/directives/count"]
  parser_directives_data["parser/directives/data"]
  parser_directives_date["parser/directives/date"]
  parser_directives_define["parser/directives/define"]
  parser_directives_env["parser/directives/env"]
  parser_directives_foreach["parser/directives/foreach"]
  parser_directives_graph["parser/directives/graph"]
  parser_directives_hash["parser/directives/hash"]
  parser_directives_if["parser/directives/if"]
  parser_directives_import["parser/directives/import"]
  parser_directives_include["parser/directives/include"]
  parser_directives_list["parser/directives/list"]
  parser_directives_pipe["parser/directives/pipe"]
  parser_directives_query["parser/directives/query"]
  parser_directives_read["parser/directives/read"]
  parser_directives_read_body["parser/directives/read-body"]
  parser_directives_read_frontmatter["parser/directives/read-frontmatter"]
  parser_directives_render["parser/directives/render"]
  parser_directives_set["parser/directives/set"]
  parser_directives_switch["parser/directives/switch"]
  parser_directives_template["parser/directives/template"]
  parser_directives_test["parser/directives/test"]
  parser_directives_tree["parser/directives/tree"]
  parser_directives_update_frontmatter["parser/directives/update-frontmatter"]
  parser_index["parser/index"]
  parser_interpolation["parser/interpolation"]
  parser_lexer["parser/lexer"]
  parser_parser["parser/parser"]
  parser_registry["parser/registry"]
  parser_types["parser/types"]
  renderer_formats_bar["renderer/formats/bar"]
  renderer_formats_code["renderer/formats/code"]
  renderer_formats_inline["renderer/formats/inline"]
  renderer_formats_json["renderer/formats/json"]
  renderer_formats_links["renderer/formats/links"]
  renderer_formats_list["renderer/formats/list"]
  renderer_formats_numbered["renderer/formats/numbered"]
  renderer_formats_table["renderer/formats/table"]
  renderer_formats_tree["renderer/formats/tree"]
  renderer_index["renderer/index"]
  renderer_renderer["renderer/renderer"]
  renderer_types["renderer/types"]
  cli_cli --> cli_cli_register_security
  cli_cli --> cli_commands_assert
  cli_cli --> cli_commands_build
  cli_cli --> cli_commands_cache
  cli_cli --> cli_commands_doctor
  cli_cli --> cli_commands_engine_trace
  cli_cli --> cli_commands_eval
  cli_cli --> cli_commands_init
  cli_cli --> cli_commands_list_imports
  cli_cli --> cli_commands_list_macros
  cli_cli --> cli_commands_parse
  cli_cli --> cli_commands_render
  cli_cli --> cli_commands_renderer_preview
  cli_cli --> cli_commands_strip
  cli_cli --> cli_commands_validate
  cli_cli --> cli_commands_watch
  cli_cli --> cli_glob_expand
  cli_cli --> parser_index
  cli_cli_register_security --> cli_commands_security
  cli_commands_assert --> cli_commands_render
  cli_commands_assert --> cli_commands_validate
  cli_commands_assert --> cli_glob_expand
  cli_commands_assert --> engine_args
  cli_commands_assert --> engine_index
  cli_commands_assert --> parser_index
  cli_commands_build --> cli_commands_render
  cli_commands_build --> engine_index
  cli_commands_cache --> engine_index
  cli_commands_doctor --> cli_commands_assert
  cli_commands_doctor --> cli_glob_expand
  cli_commands_doctor --> engine_assert_liveness
  cli_commands_doctor --> engine_index
  cli_commands_doctor --> engine_schema_loader
  cli_commands_doctor --> parser_index
  cli_commands_engine_trace --> engine_index
  cli_commands_eval --> cli_env_loader
  cli_commands_eval --> engine_index
  cli_commands_init --> cli_templates_claude_section
  cli_commands_init --> engine_index
  cli_commands_list_imports --> engine_index
  cli_commands_list_imports --> parser_index
  cli_commands_list_macros --> engine_index
  cli_commands_list_macros --> parser_index
  cli_commands_parse --> engine_index
  cli_commands_parse --> parser_index
  cli_commands_render --> cli_env_loader
  cli_commands_render --> engine_args
  cli_commands_render --> engine_index
  cli_commands_render --> parser_index
  cli_commands_renderer_preview --> renderer_index
  cli_commands_security --> engine_index
  cli_commands_strip --> cli_env_loader
  cli_commands_strip --> engine_index
  cli_commands_strip --> parser_index
  cli_commands_validate --> engine_assert_liveness
  cli_commands_validate --> engine_index
  cli_commands_validate --> parser_index
  cli_commands_watch --> cli_commands_render
  cli_commands_watch --> engine_index
  cli_glob_expand --> engine_sources_file_utils
  cli_index --> cli_commands_build
  cli_index --> cli_commands_cache
  cli_index --> cli_commands_eval
  cli_index --> cli_commands_init
  cli_index --> cli_commands_list_imports
  cli_index --> cli_commands_list_macros
  cli_index --> cli_commands_parse
  cli_index --> cli_commands_render
  cli_index --> cli_commands_strip
  cli_index --> cli_commands_validate
  cli_index --> cli_commands_watch
  engine_assert_liveness --> engine_security_config
  engine_assert_liveness --> parser_index
  engine_assert_operators --> engine_context
  engine_assert_operators --> engine_engine_include
  engine_assert_operators --> engine_frontmatter_utils
  engine_assert_operators --> engine_sources
  engine_assert_operators --> engine_sources_file_utils
  engine_assert_operators --> parser_index
  engine_assert_results --> engine_assert_operators
  engine_cache --> engine_security_config
  engine_cache --> engine_security_filesystem
  engine_cache --> engine_security_masking
  engine_cache --> parser_index
  engine_code_runners --> engine_args
  engine_code_runners --> engine_cache
  engine_code_runners --> engine_context
  engine_code_runners --> engine_engine_interpolate
  engine_code_runners --> engine_sources
  engine_code_runners --> parser_index
  engine_conditions --> engine_context
  engine_conditions --> engine_error_log
  engine_conditions --> engine_file_access
  engine_conditions --> engine_sources
  engine_context --> engine_assert_operators
  engine_context --> engine_determinism
  engine_context --> engine_security_config
  engine_context --> engine_trace_config
  engine_context --> parser_index
  engine_directive_cache --> engine_cache
  engine_directive_cache --> engine_context
  engine_directive_cache --> parser_index
  engine_engine --> engine_assert_operators
  engine_engine --> engine_assert_results
  engine_engine --> engine_code_runners
  engine_engine --> engine_conditions
  engine_engine --> engine_context
  engine_engine --> engine_determinism
  engine_engine --> engine_engine_include
  engine_engine --> engine_engine_interpolate
  engine_engine --> engine_engine_template
  engine_engine --> engine_exec_ops
  engine_engine --> engine_expand_context
  engine_engine --> engine_graph
  engine_engine --> engine_iter_ops
  engine_engine --> engine_macros
  engine_engine --> engine_pipe
  engine_engine --> engine_read_ops
  engine_engine --> engine_security_masking
  engine_engine --> engine_security_path_expand
  engine_engine --> engine_shell
  engine_engine --> engine_sources
  engine_engine --> engine_trace_config
  engine_engine --> engine_trace_emit
  engine_engine --> engine_trace_span
  engine_engine --> engine_write_ops
  engine_engine --> parser_index
  engine_engine --> renderer_index
  engine_engine_include --> engine_cache
  engine_engine_include --> engine_conditions
  engine_engine_include --> engine_context
  engine_engine_include --> engine_expand_context
  engine_engine_include --> engine_security_filesystem
  engine_engine_include --> engine_security_path_expand
  engine_engine_include --> parser_index
  engine_engine_interpolate --> engine_conditions
  engine_engine_interpolate --> engine_context
  engine_engine_interpolate --> engine_error_log
  engine_engine_interpolate --> engine_file_access
  engine_engine_interpolate --> engine_security_config
  engine_engine_interpolate --> engine_security_shell
  engine_engine_interpolate --> engine_sources
  engine_engine_interpolate --> parser_index
  engine_engine_template --> engine_conditions
  engine_engine_template --> engine_context
  engine_engine_template --> engine_engine_include
  engine_engine_template --> engine_iter_ops
  engine_engine_template --> engine_security_filesystem
  engine_engine_template --> parser_index
  engine_exec_ops --> engine_context
  engine_exec_ops --> engine_engine_include
  engine_exec_ops --> engine_security_shell
  engine_exec_ops --> parser_index
  engine_expand_context --> engine_context
  engine_expand_context --> engine_security_path_expand
  engine_file_access --> engine_context
  engine_file_access --> engine_frontmatter_utils
  engine_file_access --> engine_security_config
  engine_file_access --> engine_security_filesystem
  engine_file_access --> engine_sources
  engine_graph --> engine_assert_operators
  engine_graph --> engine_context
  engine_graph --> engine_frontmatter_utils
  engine_graph --> engine_schema_loader
  engine_graph --> engine_schema_validate
  engine_graph --> parser_index
  engine_index --> engine_assert_operators
  engine_index --> engine_assert_results
  engine_index --> engine_cache
  engine_index --> engine_conditions
  engine_index --> engine_context
  engine_index --> engine_engine
  engine_index --> engine_pipe
  engine_index --> engine_security_claude_settings
  engine_index --> engine_security_config
  engine_index --> engine_security_filesystem
  engine_index --> engine_security_masking
  engine_index --> engine_security_rules
  engine_index --> engine_security_shell
  engine_index --> engine_security_trust
  engine_index --> engine_stripper
  engine_index --> engine_trace_config
  engine_index --> engine_trace_emit
  engine_index --> engine_trace_span
  engine_iter_ops --> engine_conditions
  engine_iter_ops --> engine_context
  engine_iter_ops --> engine_macros
  engine_iter_ops --> parser_index
  engine_macros --> engine_engine_include
  engine_macros --> parser_index
  engine_read_ops --> engine_context
  engine_read_ops --> engine_engine_include
  engine_read_ops --> engine_file_access
  engine_read_ops --> engine_frontmatter_utils
  engine_read_ops --> engine_schema_loader
  engine_read_ops --> engine_schema_validate
  engine_read_ops --> engine_security_filesystem
  engine_read_ops --> engine_security_path_expand
  engine_read_ops --> engine_sources
  engine_read_ops --> parser_index
  engine_schema_validate --> engine_schema_loader
  engine_security_audit --> engine_security_rules
  engine_security_claude_settings --> engine_security_config
  engine_security_claude_settings --> engine_security_rules
  engine_security_claude_settings --> engine_security_shell
  engine_security_filesystem --> engine_security_config
  engine_security_filesystem --> engine_security_rules
  engine_security_masking --> engine_security_config
  engine_security_masking --> engine_security_rules
  engine_security_shell --> engine_security_config
  engine_security_shell --> engine_security_rules
  engine_shell --> engine_context
  engine_shell --> engine_security_config
  engine_shell --> engine_security_shell
  engine_sources --> engine_context
  engine_sources --> engine_directive_cache
  engine_sources --> engine_engine_include
  engine_sources --> engine_frontmatter_utils
  engine_sources --> engine_security_claude_settings
  engine_sources --> engine_security_filesystem
  engine_sources --> engine_security_path_expand
  engine_sources --> engine_security_shell
  engine_sources --> engine_sources_file_utils
  engine_sources --> parser_index
  engine_stripper --> parser_index
  engine_trace_emit --> engine_trace_config
  engine_trace_emit --> engine_trace_span
  engine_write_ops --> engine_context
  engine_write_ops --> engine_engine_include
  engine_write_ops --> engine_expand_context
  engine_write_ops --> engine_frontmatter_utils
  engine_write_ops --> engine_macros
  engine_write_ops --> engine_schema_loader
  engine_write_ops --> engine_schema_validate
  engine_write_ops --> engine_security_filesystem
  engine_write_ops --> engine_security_path_expand
  engine_write_ops --> parser_index
  hook_pretooluse --> engine_index
  hook_pretooluse --> parser_index
  parser_args --> parser_types
  parser_directives_assert --> parser_types
  parser_directives_cache_attrs --> parser_types
  parser_directives_call --> parser_types
  parser_directives_check --> parser_types
  parser_directives_code --> parser_directives_cache_attrs
  parser_directives_code --> parser_types
  parser_directives_count --> parser_types
  parser_directives_data --> parser_types
  parser_directives_date --> parser_types
  parser_directives_define --> parser_types
  parser_directives_env --> parser_types
  parser_directives_foreach --> parser_types
  parser_directives_graph --> parser_types
  parser_directives_hash --> parser_types
  parser_directives_if --> parser_types
  parser_directives_import --> parser_types
  parser_directives_include --> parser_directives_cache_attrs
  parser_directives_include --> parser_types
  parser_directives_list --> parser_directives_cache_attrs
  parser_directives_list --> parser_types
  parser_directives_pipe --> parser_types
  parser_directives_query --> parser_directives_cache_attrs
  parser_directives_query --> parser_types
  parser_directives_read --> parser_directives_cache_attrs
  parser_directives_read --> parser_types
  parser_directives_read_body --> parser_types
  parser_directives_read_frontmatter --> parser_types
  parser_directives_render --> parser_types
  parser_directives_set --> parser_types
  parser_directives_switch --> parser_types
  parser_directives_template --> parser_types
  parser_directives_test --> parser_types
  parser_directives_tree --> parser_directives_cache_attrs
  parser_directives_tree --> parser_types
  parser_directives_update_frontmatter --> parser_types
  parser_index --> parser_interpolation
  parser_index --> parser_parser
  parser_index --> parser_registry
  parser_index --> parser_types
  parser_interpolation --> parser_types
  parser_parser --> parser_directives_pipe
  parser_parser --> parser_interpolation
  parser_parser --> parser_registry
  parser_parser --> parser_types
  parser_registry --> parser_directives_assert
  parser_registry --> parser_directives_call
  parser_registry --> parser_directives_check
  parser_registry --> parser_directives_code
  parser_registry --> parser_directives_count
  parser_registry --> parser_directives_data
  parser_registry --> parser_directives_date
  parser_registry --> parser_directives_define
  parser_registry --> parser_directives_env
  parser_registry --> parser_directives_foreach
  parser_registry --> parser_directives_graph
  parser_registry --> parser_directives_hash
  parser_registry --> parser_directives_if
  parser_registry --> parser_directives_import
  parser_registry --> parser_directives_include
  parser_registry --> parser_directives_list
  parser_registry --> parser_directives_pipe
  parser_registry --> parser_directives_query
  parser_registry --> parser_directives_read
  parser_registry --> parser_directives_read_body
  parser_registry --> parser_directives_read_frontmatter
  parser_registry --> parser_directives_render
  parser_registry --> parser_directives_set
  parser_registry --> parser_directives_switch
  parser_registry --> parser_directives_template
  parser_registry --> parser_directives_test
  parser_registry --> parser_directives_tree
  parser_registry --> parser_directives_update_frontmatter
  parser_registry --> parser_types
  renderer_formats_bar --> renderer_types
  renderer_formats_code --> renderer_types
  renderer_formats_inline --> renderer_types
  renderer_formats_json --> renderer_types
  renderer_formats_links --> renderer_types
  renderer_formats_list --> renderer_types
  renderer_formats_numbered --> renderer_types
  renderer_formats_table --> renderer_types
  renderer_formats_tree --> renderer_types
  renderer_index --> renderer_renderer
  renderer_renderer --> renderer_formats_bar
  renderer_renderer --> renderer_formats_code
  renderer_renderer --> renderer_formats_inline
  renderer_renderer --> renderer_formats_json
  renderer_renderer --> renderer_formats_links
  renderer_renderer --> renderer_formats_list
  renderer_renderer --> renderer_formats_numbered
  renderer_renderer --> renderer_formats_table
  renderer_renderer --> renderer_formats_tree
  renderer_renderer --> renderer_types
```
