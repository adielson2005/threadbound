import * as THREE from 'three';

// Estilo visual de jogo mobile, aplicado a todos os materiais do three.js de uma vez (trechos de
// shader compartilhados, antes de qualquer material compilar):
//  - luz em faixas (cel shading suave): a luz do sol vira duas faixas com borda macia, em vez de
//    um degradê contínuo; parte do degradê fica, para o volume não sumir
//  - sombra fria e luz quente: o lado escuro puxa para o azul-lilás, o lado aceso para o dourado
//  - brilho de borda (rim): a silhueta de morros, árvores e personagens acende contra o céu
//  - cores mais vivas: saturação um pouco acima do natural
// Custa poucas operações por pixel, sem passada extra de pós-processamento, então roda igual no
// celular. ?estilo=0 desliga (para comparar).

export const ESTILO_LIGADO = new URLSearchParams(location.search).get('estilo') !== '0';

const LINHA_LUZ = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const FAIXAS = `${LINHA_LUZ}
	// cel shading suave: duas faixas (meia-luz e luz cheia) misturadas com um pouco do degradê
	dotNL = mix( dotNL, 0.12 + 0.5 * smoothstep( 0.0, 0.08, dotNL ) + 0.38 * smoothstep( 0.38, 0.5, dotNL ), 0.85 );`;

const GRADE = `
	{
		// cores mais vivas ("vibrance": realça mais o que está apagado, quase não mexe no que já é
		// saturado, para o verde das folhas não estourar), sombra fria e luz quente
		float lumEstilo = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
		float maxC = max( outgoingLight.r, max( outgoingLight.g, outgoingLight.b ) ), minC = min( outgoingLight.r, min( outgoingLight.g, outgoingLight.b ) );
		float satEstilo = ( maxC - minC ) / max( maxC, 1e-4 );
		outgoingLight = mix( vec3( lumEstilo ), outgoingLight, 1.0 + 0.5 * ( 1.0 - smoothstep( 0.2, 0.75, satEstilo ) ) );
		// (o frio entra só na sombra funda e mais fraco: forte, ele deixava reboco e pedra cinza azulados)
		outgoingLight *= mix( vec3( 0.9, 0.95, 1.08 ), vec3( 1.08, 1.01, 0.9 ), smoothstep( 0.02, 0.35, lumEstilo ) );
		#if defined( ESTILO_RIM )
			// brilho de borda: mais forte onde já há luz (não acende o lado de dentro da sombra)
			float bordaEstilo = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
			outgoingLight += vec3( 1.0, 0.96, 0.88 ) * pow( bordaEstilo, 3.0 ) * 0.3 * smoothstep( 0.02, 0.4, lumEstilo );
		#endif
		outgoingLight = max( outgoingLight, vec3( 0.0 ) );
	}
	#include <opaque_fragment>`;

// Névoa por altura: além da neblina de distância (que fecha a vista no limite do desenho, sem
// corte), uma bruma azulada que engrossa da metade das falésias para baixo. As ilhas ficam
// flutuando sobre um mar de névoa e o mar e a praia lá embaixo ganham profundidade, com o custo de
// uma conta por vértice e duas por pixel. A altura do pixel vem da posição na câmera (a matriz de
// vista é rígida), então funciona em qualquer shader que já tem neblina: malhas, sprites, água.
const NEVOA_VERT = `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogMundo = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif`;
const NEVOA_FRAG = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	// bruma baixa: começa uns 25 m abaixo do topo das ilhas e engrossa até a metade lá embaixo (o mar
	// e a praia continuam aparecendo, azulados: é deles que vem a sensação de estar no alto)
	float brumaBaixa = ( 1.0 - smoothstep( -90.0, -25.0, vFogMundo.y ) ) * smoothstep( 15.0, 70.0, vFogDepth ) * 0.5;
	vec3 corNevoa = mix( fogColor, fogColor * vec3( 0.86, 0.95, 1.08 ), brumaBaixa );
	// o lado do sol: o ar contra o sol se acende em dourado, igual ao céu atrás (sem isso morros e
	// ilhas distantes ficavam azul-acinzentados na frente do horizonte dourado)
	vec3 dirNevoa = normalize( vFogMundo - cameraPosition );
	float sNevoa = max( dot( dirNevoa, fogSol.xyz ), 0.0 );
	corNevoa = mix( corNevoa, fogBrilho.rgb, sNevoa * sNevoa * ( 1.0 - abs( dirNevoa.y ) ) * fogSol.w ) + fogBrilho.rgb * pow( sNevoa, 5.0 ) * fogBrilho.a;
	gl_FragColor.rgb = mix( gl_FragColor.rgb, corNevoa, max( fogFactor, brumaBaixa ) );
#endif`;

// direção do sol visível + força do dourado; cor do dourado + força do halo (ceu.js)
export const NEVOA_SOL = new Float32Array(4), NEVOA_BRILHO = new Float32Array(4);
export function atualizarNevoaSol(e, chuva) {
  const acima = THREE.MathUtils.smoothstep(e.solVisivel.y, -0.08, 0.02) * (1 - chuva * 0.8);
  const k = (0.45 * e.dia + 0.5 * e.por) * acima;
  NEVOA_SOL[0] = e.solVisivel.x; NEVOA_SOL[1] = e.solVisivel.y; NEVOA_SOL[2] = e.solVisivel.z; NEVOA_SOL[3] = k;
  NEVOA_BRILHO[0] = e.corBrilho.r * 1.05; NEVOA_BRILHO[1] = e.corBrilho.g * 1.05; NEVOA_BRILHO[2] = e.corBrilho.b * 1.05;
  NEVOA_BRILHO[3] = (0.18 + 0.35 * e.por) * acima * Math.max(e.dia, e.por) * 0.6;
}

// Tone mapping do Low e do Medium (jogo.js): o Neutral (Khronos) sem a "curva de pé". O original
// também puxa os tons escuros para baixo (tira até 0,04 de cada canal) e isso escurecia a floresta na
// sombra; aqui fica só a compressão dos claros (acima de ~76% do branco), que é o que impede a grama e
// as folhas ao sol de estourarem. Vale para o desenho direto e para o OutputPass do FXAA (os dois usam
// este mesmo trecho de shader).
const PE_NEUTRO = '\tfloat x = min( color.r, min( color.g, color.b ) );\n\tfloat offset = x < 0.08 ? x - 6.25 * x * x : 0.04;\n\tcolor -= offset;\n';
function ajustarToneMapping() {
  const C = THREE.ShaderChunk;
  if (C.tonemapping_pars_fragment.includes(PE_NEUTRO)) C.tonemapping_pars_fragment = C.tonemapping_pars_fragment.replace(PE_NEUTRO, '');
  else console.warn('estilo: tone mapping Neutral mudou');
}

export function aplicarEstilo() {
  ajustarToneMapping();
  if (!ESTILO_LIGADO) return;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogMundo;');
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogMundo;\n\tuniform vec4 fogSol;\n\tuniform vec4 fogBrilho;');
  // o sol da névoa é o mesmo para todos os materiais: arrays comuns (não Vector3) não são clonados
  // pelo three.js, então todos apontam para os mesmos números e basta mudá-los uma vez por quadro
  const extra = { fogSol: { value: NEVOA_SOL }, fogBrilho: { value: NEVOA_BRILHO } };
  Object.assign(THREE.UniformsLib.fog, extra);
  for (const s of Object.values(THREE.ShaderLib)) if (s.uniforms.fogColor) Object.assign(s.uniforms, extra);
  C.fog_vertex = NEVOA_VERT;
  C.fog_fragment = NEVOA_FRAG;
  for (const nome of ['lights_lambert_pars_fragment', 'lights_physical_pars_fragment']) {
    if (!C[nome].includes(LINHA_LUZ)) { console.warn('estilo: trecho mudou', nome); continue; }
    // a faixa vale para a luz direta (sol/lua); a luz do céu continua suave
    C[nome] = C[nome].replace(LINHA_LUZ, FAIXAS);
    // rim só onde existem normal e vViewPosition (Lambert e PBR)
    C[nome] = '#define ESTILO_RIM\n' + C[nome];
  }
  // a grade de cor entra no fim de cada material padrão (antes da neblina)
  // (ShaderLib guarda uma cópia do texto de cada material: Lambert, Standard e Physical)
  for (const nome of ['lambert', 'standard', 'physical']) {
    const s = THREE.ShaderLib[nome];
    if (s.fragmentShader.includes('#include <opaque_fragment>')) s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', GRADE);
  }
}
