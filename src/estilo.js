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
	vFogAltura = ( transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) ).y;
#endif`;
const NEVOA_FRAG = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	// bruma baixa: começa uns 15 m abaixo do topo das ilhas e cobre quase tudo 70 m abaixo
	float brumaBaixa = ( 1.0 - smoothstep( -75.0, -15.0, vFogAltura ) ) * smoothstep( 8.0, 50.0, vFogDepth ) * 0.82;
	vec3 corNevoa = mix( fogColor, fogColor * vec3( 0.86, 0.95, 1.08 ), brumaBaixa );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, corNevoa, max( fogFactor, brumaBaixa ) );
#endif`;

export function aplicarEstilo() {
  if (!ESTILO_LIGADO) return;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogAltura;');
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogAltura;');
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
