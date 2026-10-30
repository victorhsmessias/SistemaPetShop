import { conferirAdminOuRedirecionar } from "@/app/admin/conferir-admin";
import {
  FormularioCriarDona,
  FormularioEncerrarSessoes,
  FormularioNovaEmpresa,
  FormularioRedefinirSenha,
} from "@/app/admin/formularios";
import { FUSOS_HORARIOS, NOMES_DOS_FUSOS, listarEmpresas } from "@/modules/administracao/empresas";

// Confere role = 'admin' por conta própria: o layout roda em paralelo, não antes.
export default async function PaginaAdmin() {
  const { cabecalhos } = await conferirAdminOuRedirecionar();
  const empresas = await listarEmpresas(cabecalhos);

  return (
    <>
      <h1>Empresas</h1>

      <section className="cartao">
        <details>
          <summary>Nova empresa</summary>
          <FormularioNovaEmpresa fusos={FUSOS_HORARIOS.map((fuso) => ({ valor: fuso, nome: NOMES_DOS_FUSOS[fuso] }))} />
        </details>
      </section>

      {empresas.length === 0 ? (
        <p className="suave">Nenhuma empresa ainda.</p>
      ) : (
        <ul className="lista-simples">
          {empresas.map((item) => (
            <li key={item.id} className="cartao">
              <h2>{item.nome}</h2>
              <p className="suave">
                <span className="etiqueta">{item.status}</span>{" "}
                {NOMES_DOS_FUSOS[item.fusoHorario as (typeof FUSOS_HORARIOS)[number]] ?? item.fusoHorario}
              </p>

              {item.usuarias.length === 0 ? (
                <>
                  <p className="mensagem mensagem-aviso">Esta empresa ainda não tem usuária.</p>
                  <details>
                    <summary>Criar dona</summary>
                    <FormularioCriarDona empresaId={item.id} />
                  </details>
                </>
              ) : (
                item.usuarias.map((usuaria) => (
                  <div key={usuaria.id}>
                    <p>
                      <strong>{usuaria.nome}</strong>
                      <br />
                      <span className="suave">{usuaria.email}</span>
                    </p>
                    <details>
                      <summary>Redefinir senha</summary>
                      <FormularioRedefinirSenha usuarioId={usuaria.id} />
                    </details>
                    <details>
                      <summary>Encerrar sessões</summary>
                      <FormularioEncerrarSessoes usuarioId={usuaria.id} />
                    </details>
                  </div>
                ))
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
