#version 410 core

out vec4 out_color;

uniform sampler2D framebuffer_tex;
// Split-screen UV remapping: each player samples from their own half of the framebuffer.
// Single-player: scale=1.0, offset=0.0. P1: scale=0.5, offset=0.0. P2: scale=0.5, offset=0.5.
uniform float u_distort_x_scale;
uniform float u_distort_x_offset;

flat in vec4 fragment_color;
in vec2 tex_coord;

void main() {
  vec4 color = fragment_color;

  // correct color
  color *= 2;

  // correct texture coordinates
  vec2 texture_coords = vec2(u_distort_x_offset + tex_coord.x * u_distort_x_scale,
                             (1.0f - tex_coord.y) - (1 - (SCISSOR_HEIGHT / 512.0)) / 2);

  // sample framebuffer texture
  out_color = color * texture(framebuffer_tex, texture_coords);
}
